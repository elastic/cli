//go:build functional

package functional_test

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/proto"
)

// TestOTelSpansForCLICommand is a black-box test that verifies the CLI
// exports OpenTelemetry spans when running a command.  It checks:
//   - a span named after the command is exported to the OTLP endpoint,
//   - the span carries the trace ID propagated from the TRACEPARENT env var, and
//   - outgoing requests to the target API include a traceparent header.
func TestOTelSpansForCLICommand(t *testing.T) {
	// Start a fake OTLP HTTP server that collects exported spans.
	var mu sync.Mutex
	var collectedSpans []*tracepb.Span
	var collectedResourceAttrs []*commonpb.KeyValue

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
			if res := rs.GetResource(); res != nil {
				collectedResourceAttrs = append(collectedResourceAttrs, res.GetAttributes()...)
			}
			for _, ss := range rs.GetScopeSpans() {
				collectedSpans = append(collectedSpans, ss.GetSpans()...)
			}
		}
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer otlpSrv.Close()

	// Start a fake Elasticsearch server and record whether it receives a traceparent.
	var esTraceparent string
	esSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		if esTraceparent == "" {
			esTraceparent = r.Header.Get("Traceparent")
		}
		mu.Unlock()
		if r.URL.Path == "/_cluster/health" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"cluster_name":    "test",
				"status":          "green",
				"number_of_nodes": 1,
				"active_shards":   0,
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer esSrv.Close()

	// Write a CLI config file pointing at the fake Elasticsearch server so that
	// we don't need to invoke the CLI a second time to configure it.
	tempHome := t.TempDir()
	configDir := filepath.Join(tempHome, ".config", "elastic")
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	configContent := fmt.Sprintf(`current-context: test
contexts:
  test:
    elasticsearch_url: %q
    username: elastic
    password: elastic
otel:
  file_format: "0.3"
  propagator:
    composite:
      - tracecontext: {}
      - baggage: {}
  tracer_provider:
    processors:
      - batch:
          exporter:
            otlp_http:
              endpoint: %q
`, esSrv.URL, otlpSrv.URL)
	if err := os.WriteFile(filepath.Join(configDir, "config.yaml"), []byte(configContent), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	// Run the CLI as a subprocess.  The OTLP exporter is flushed on process exit
	// (via tp.Shutdown inside Execute), so all spans arrive before runElastic returns.
	const parentTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	repoRoot := filepath.Clean(filepath.Join(wd, "..", ".."))
	env := []string{
		"XDG_CONFIG_HOME=" + filepath.Join(tempHome, ".config"),
		"TRACEPARENT=00-" + parentTraceID + "-00f067aa0ba902b7-01",
	}
	runElastic(t, repoRoot, env, "es", "cluster", "health", "-f", "json")

	mu.Lock()
	defer mu.Unlock()

	// Verify the command span was exported with the expected name.
	const wantSpanName = "elastic es cluster health"
	var cmdSpan *tracepb.Span
	for _, s := range collectedSpans {
		if s.GetName() == wantSpanName {
			cmdSpan = s
			break
		}
	}
	if cmdSpan == nil {
		names := make([]string, 0, len(collectedSpans))
		for _, s := range collectedSpans {
			names = append(names, s.GetName())
		}
		t.Fatalf("command span %q not found in exported spans: %v", wantSpanName, names)
	}

	// Verify the span carries the trace ID from the TRACEPARENT environment variable.
	if got := hex.EncodeToString(cmdSpan.GetTraceId()); got != parentTraceID {
		t.Errorf("command span trace ID = %q, want %q", got, parentTraceID)
	}

	// Verify the CLI propagated trace context to the Elasticsearch endpoint.
	if esTraceparent == "" {
		t.Error("Elasticsearch request did not carry a traceparent header")
	}

	// Verify the default service.name resource attribute is present even
	// though the config does not explicitly set one.
	var gotServiceName string
	for _, attr := range collectedResourceAttrs {
		if attr.GetKey() == "service.name" {
			gotServiceName = attr.GetValue().GetStringValue()
			break
		}
	}
	if gotServiceName != "elastic-cli" {
		t.Errorf("resource service.name = %q, want %q", gotServiceName, "elastic-cli")
	}
}
