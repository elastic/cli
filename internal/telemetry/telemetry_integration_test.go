package telemetry_test

import (
	"context"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/elastic/cli/internal/telemetry"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/proto"
)

// TestIntegration verifies that:
//   - a command span is created and exported with the correct name,
//   - the span is linked to a parent trace propagated from the environment,
//   - and the instrumented HTTP transport injects trace context into outgoing API requests.
func TestIntegration(t *testing.T) {
	// Collect spans exported to the mock OTLP server.
	var mu sync.Mutex
	var receivedSpans []*tracepb.Span

	otlpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/traces" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var req collectortracepb.ExportTraceServiceRequest
		if err := proto.Unmarshal(body, &req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		mu.Lock()
		for _, rs := range req.GetResourceSpans() {
			for _, ss := range rs.GetScopeSpans() {
				receivedSpans = append(receivedSpans, ss.GetSpans()...)
			}
		}
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer otlpSrv.Close()

	// Record whether the mock API server received a traceparent header.
	var apiTraceparent string
	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		apiTraceparent = r.Header.Get("Traceparent")
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer apiSrv.Close()

	// Configure the OTLP exporter to use the mock server, and set a parent
	// trace context via the standard TRACEPARENT environment variable.
	const parentTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", otlpSrv.URL)
	t.Setenv("TRACEPARENT", "00-"+parentTraceID+"-00f067aa0ba902b7-01")

	ctx := context.Background()
	shutdown, err := telemetry.Init(ctx)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}

	// Propagate the environment parent context and start a command span.
	ctx = telemetry.ExtractContextFromEnv(ctx)
	const commandName = "elastic es cluster health"
	ctx, span := telemetry.StartCommandSpan(ctx, commandName, "default", "json", nil)

	// Make an HTTP request through the instrumented transport.
	client := &http.Client{Transport: telemetry.NewTransport(nil)}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiSrv.URL+"/api/endpoint", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("HTTP request to mock API: %v", err)
	}
	resp.Body.Close()

	// End the command span and flush all pending exports.
	span.End()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	// Verify the command span was exported with the expected name.
	// Exactly one span with this name should be created per command execution.
	var cmdSpan *tracepb.Span
	for _, s := range receivedSpans {
		if s.GetName() == commandName {
			cmdSpan = s
			break
		}
	}
	if cmdSpan == nil {
		names := make([]string, 0, len(receivedSpans))
		for _, s := range receivedSpans {
			names = append(names, s.GetName())
		}
		t.Fatalf("command span %q not found in exported spans %v", commandName, names)
	}

	// Verify the command span carries the trace ID from the TRACEPARENT env var.
	if got := hex.EncodeToString(cmdSpan.GetTraceId()); got != parentTraceID {
		t.Errorf("command span trace ID = %q, want %q", got, parentTraceID)
	}

	// Verify the instrumented transport propagated trace context to the API.
	if apiTraceparent == "" {
		t.Error("mock API server did not receive a traceparent header")
	}
}
