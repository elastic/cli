package mcpproxy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/elastic/cli/internal/telemetry"
	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Proxy transparently bridges a stdio MCP client with a remote Streamable HTTP
// MCP server.
type Proxy struct {
	URL    string
	APIKey string

	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer

	mu              sync.Mutex
	initializeID    any
	protocolVersion string

	sseOnce sync.Once

	logMu sync.Mutex
}

// Run reads JSON-RPC messages from stdin, forwards them to the remote MCP
// endpoint over HTTP, and writes responses back to stdout. It blocks until
// stdin is closed or ctx is cancelled.
func (p *Proxy) Run(ctx context.Context) error {
	if stringsTrim(p.URL) == "" {
		return errors.New("mcp proxy: URL is required")
	}
	if p.Stdin == nil || p.Stdout == nil {
		return errors.New("mcp proxy: stdin and stdout are required")
	}
	if p.Stderr == nil {
		p.Stderr = io.Discard
	}

	hc := p.httpClient()
	local, err := (&mcp.IOTransport{
		Reader: io.NopCloser(p.Stdin),
		Writer: nopWriteCloser{p.Stdout},
	}).Connect(ctx)
	if err != nil {
		return fmt.Errorf("mcp proxy: connect stdio: %w", err)
	}
	defer local.Close()

	remote, err := (&mcp.StreamableClientTransport{
		Endpoint:   p.URL,
		HTTPClient: hc,
	}).Connect(ctx)
	if err != nil {
		return fmt.Errorf("mcp proxy: connect remote: %w", err)
	}
	defer remote.Close()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go p.runStandaloneSSE(ctx, hc, remote, local)

	errCh := make(chan error, 2)

	go func() { errCh <- p.pipeClientToServer(ctx, local, remote) }()
	go func() { errCh <- p.pipeServerToClient(ctx, remote, local) }()

	// Wait for one side to terminate, then shut down everything.
	err1 := <-errCh
	cancel()
	_ = local.Close()
	_ = remote.Close()
	err2 := <-errCh

	return firstNonTrivialErr(err1, err2)
}

func (p *Proxy) pipeClientToServer(ctx context.Context, local, remote mcp.Connection) error {
	for {
		msg, err := local.Read(ctx)
		if err != nil {
			return normalizePipeErr(err)
		}

		if req, ok := msg.(*jsonrpc.Request); ok && req.Method == "initialize" && req.IsCall() {
			p.mu.Lock()
			p.initializeID = req.ID.Raw()
			p.protocolVersion = ""
			p.mu.Unlock()
		}

		if err := remote.Write(ctx, msg); err != nil {
			// For request-level transport rejections, synthesize a JSON-RPC error
			// response so the client doesn't hang.
			if isRejectedByTransport(err) {
				if req, ok := msg.(*jsonrpc.Request); ok && req.IsCall() {
					_ = local.Write(ctx, &jsonrpc.Response{
						ID: req.ID,
						Error: &jsonrpc.Error{
							Code:    int64(jsonrpc.CodeInternalError),
							Message: err.Error(),
						},
					})
					continue
				}
				p.logf("remote rejected message: %v", err)
				continue
			}
			return err
		}
	}
}

func (p *Proxy) pipeServerToClient(ctx context.Context, remote, local mcp.Connection) error {
	for {
		msg, err := remote.Read(ctx)
		if err != nil {
			return normalizePipeErr(err)
		}

		if resp, ok := msg.(*jsonrpc.Response); ok {
			initID, needsPV := p.initializeTracking(resp.ID.Raw())
			if needsPV && initID != nil && resp.Error == nil && len(resp.Result) > 0 {
				var initRes struct {
					ProtocolVersion string `json:"protocolVersion"`
				}
				if err := json.Unmarshal(resp.Result, &initRes); err == nil && stringsTrim(initRes.ProtocolVersion) != "" {
					p.mu.Lock()
					if p.initializeID != nil && p.initializeID == resp.ID.Raw() {
						p.protocolVersion = stringsTrim(initRes.ProtocolVersion)
						p.initializeID = nil
					}
					p.mu.Unlock()
				}
			}
		}

		if err := local.Write(ctx, msg); err != nil {
			return err
		}
	}
}

type nopWriteCloser struct{ io.Writer }

func (nopWriteCloser) Close() error { return nil }

type sseEvent struct {
	Name  string
	ID    string
	Retry time.Duration
	Data  []byte
}

func (p *Proxy) runStandaloneSSE(ctx context.Context, hc *http.Client, remote, local mcp.Connection) {
	// This should only run once per proxy instance.
	p.sseOnce.Do(func() {})

	// Wait until we have both: a session ID and a negotiated protocol version.
	// (The version is needed for the Mcp-Protocol-Version header, which Kibana
	// may enforce on GET.)
	for {
		if ctx.Err() != nil {
			return
		}
		if stringsTrim(remote.SessionID()) != "" && stringsTrim(p.protocolVersionValue()) != "" {
			break
		}
		sleep(ctx, 50*time.Millisecond)
	}

	var (
		lastEventID string
		backoff     = 500 * time.Millisecond
	)

	for {
		if ctx.Err() != nil {
			return
		}

		sid := stringsTrim(remote.SessionID())
		if sid == "" {
			// Session ended; the POST path may reinitialize soon.
			sleep(ctx, 250*time.Millisecond)
			continue
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.URL, nil)
		if err != nil {
			p.logf("standalone SSE: create request: %v", err)
			return
		}
		req.Header.Set("Accept", "text/event-stream")
		req.Header.Set("Mcp-Session-Id", sid)
		if lastEventID != "" {
			req.Header.Set("Last-Event-ID", lastEventID)
		}

		resp, err := hc.Do(req)
		if err != nil {
			p.logf("standalone SSE: request failed: %v", err)
			sleep(ctx, backoff)
			backoff = minDuration(30*time.Second, backoff*2)
			continue
		}

		// If unsupported, stop silently (spec-compliant response is 405).
		if resp.StatusCode == http.StatusMethodNotAllowed {
			_ = resp.Body.Close()
			return
		}
		// Some servers return 4xx instead of 405; treat as "unsupported" to avoid
		// breaking the proxy.
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			_ = resp.Body.Close()
			return
		}
		ct := strings.TrimSpace(strings.SplitN(resp.Header.Get("Content-Type"), ";", 2)[0])
		if ct != "text/event-stream" {
			_ = resp.Body.Close()
			return
		}

		// Connected successfully: reset backoff.
		backoff = 500 * time.Millisecond

		retryAfter, err := readSSE(resp.Body, func(evt sseEvent) bool {
			if ctx.Err() != nil {
				return false
			}
			if evt.ID != "" {
				lastEventID = evt.ID
			}
			// Default SSE event name is "message".
			if evt.Name != "" && evt.Name != "message" {
				// "close" is used in newer specs to indicate a reconnect hint.
				if evt.Name == "close" {
					return false
				}
				return true
			}
			if len(evt.Data) == 0 {
				return true
			}
			msg, err := jsonrpc.DecodeMessage(evt.Data)
			if err != nil {
				p.logf("standalone SSE: decode message: %v", err)
				return true
			}
			if err := local.Write(ctx, msg); err != nil {
				return false
			}
			return true
		})
		_ = resp.Body.Close()

		if ctx.Err() != nil {
			return
		}
		if err != nil && !errors.Is(err, io.EOF) {
			p.logf("standalone SSE: stream error: %v", err)
		}
		if retryAfter > 0 {
			sleep(ctx, retryAfter)
		}
	}
}

// readSSE parses Server-Sent Events from r and yields fully-formed events.
// It supports multi-line "data:" fields, joining them with "\n" per the SSE spec.
func readSSE(r io.Reader, yield func(sseEvent) bool) (retryAfter time.Duration, err error) {
	br := bufio.NewReaderSize(r, 64*1024)
	var (
		cur      sseEvent
		dataBuf  bytes.Buffer
		haveData bool
	)

	flush := func() bool {
		if dataBuf.Len() > 0 {
			b := dataBuf.Bytes()
			if b[len(b)-1] == '\n' {
				b = b[:len(b)-1]
			}
			cur.Data = append([]byte(nil), b...)
		}
		ok := yield(cur)
		cur = sseEvent{}
		dataBuf.Reset()
		haveData = false
		return ok
	}

	for {
		line, readErr := br.ReadString('\n')
		if readErr != nil && len(line) == 0 {
			if haveData || cur.Name != "" || cur.ID != "" || cur.Retry > 0 {
				_ = flush()
			}
			return retryAfter, readErr
		}
		line = strings.TrimRight(line, "\r\n")

		if line == "" {
			// Event boundary.
			if haveData || cur.Name != "" || cur.ID != "" || cur.Retry > 0 {
				if !flush() {
					return retryAfter, nil
				}
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			// Comment.
			continue
		}

		field, val, _ := strings.Cut(line, ":")
		if strings.HasPrefix(val, " ") {
			val = val[1:]
		}

		switch field {
		case "event":
			cur.Name = val
		case "data":
			haveData = true
			dataBuf.WriteString(val)
			dataBuf.WriteByte('\n')
		case "id":
			cur.ID = val
		case "retry":
			if n, pErr := strconv.ParseInt(strings.TrimSpace(val), 10, 64); pErr == nil && n >= 0 {
				cur.Retry = time.Duration(n) * time.Millisecond
			}
		}

		// Preserve retryAfter so callers can honor server hints after disconnect.
		if cur.Retry > 0 {
			retryAfter = cur.Retry
		}
	}
}

type headerRoundTripper struct {
	base            http.RoundTripper
	apiKey          string
	protocolVersion func() string
}

func (rt headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	base := rt.base
	if base == nil {
		base = http.DefaultTransport
	}
	r2 := req.Clone(req.Context())
	if stringsTrim(rt.apiKey) != "" {
		r2.Header.Set("Authorization", "ApiKey "+rt.apiKey)
	}
	// Kibana API protection; required for non-GET in many setups.
	r2.Header.Set("kbn-xsrf", "elastic")
	if rt.protocolVersion != nil {
		if pv := stringsTrim(rt.protocolVersion()); pv != "" {
			r2.Header.Set("Mcp-Protocol-Version", pv)
		}
	}
	return base.RoundTrip(r2)
}

func (p *Proxy) httpClient() *http.Client {
	// Important: don't set Client.Timeout for streamable HTTP/SSE.
	return &http.Client{
		Transport: telemetry.NewTransport(headerRoundTripper{
			base:   http.DefaultTransport,
			apiKey: p.APIKey,
			protocolVersion: func() string {
				p.mu.Lock()
				defer p.mu.Unlock()
				return p.protocolVersion
			},
		}),
	}
}

const rejectedByTransportCode int64 = -32005 // jsonrpc2.ErrRejected

func isRejectedByTransport(err error) bool {
	var w *jsonrpc.Error
	if errors.As(err, &w) {
		return w.Code == rejectedByTransportCode
	}
	return false
}

func normalizePipeErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, io.EOF) {
		return nil
	}
	return err
}

func firstNonTrivialErr(errs ...error) error {
	for _, err := range errs {
		if err := normalizePipeErr(err); err != nil {
			return err
		}
	}
	return nil
}

func stringsTrim(s string) string {
	return strings.TrimSpace(s)
}

func (p *Proxy) initializeTracking(respID any) (initID any, needPV bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.initializeID == nil {
		return nil, false
	}
	return p.initializeID, p.initializeID == respID && p.protocolVersion == ""
}

func (p *Proxy) protocolVersionValue() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.protocolVersion
}

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

func (p *Proxy) logf(format string, args ...any) {
	p.logMu.Lock()
	defer p.logMu.Unlock()
	fmt.Fprintf(p.Stderr, "[mcp-proxy] "+format+"\n", args...)
}
