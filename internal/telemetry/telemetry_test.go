package telemetry

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel/trace"
)

func TestExtractContextFromEnv(t *testing.T) {
	t.Setenv("TRACEPARENT", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	ctx := ExtractContextFromEnv(context.Background())
	if got := trace.SpanContextFromContext(ctx); !got.IsValid() {
		t.Fatal("expected valid span context")
	}
}
