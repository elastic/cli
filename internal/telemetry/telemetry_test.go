package telemetry

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

func TestExtractContextFromEnvironment(t *testing.T) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	t.Setenv("TRACEPARENT", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	t.Setenv("TRACESTATE", "")
	t.Setenv("BAGGAGE", "tenant=acme")

	ctx := ExtractContextFromEnvironment(context.Background())
	spanCtx := trace.SpanContextFromContext(ctx)
	if !spanCtx.IsValid() {
		t.Fatalf("expected valid span context")
	}
	if got, want := spanCtx.TraceID().String(), "4bf92f3577b34da6a3ce929d0e0e4736"; got != want {
		t.Fatalf("trace id = %s, want %s", got, want)
	}
}

func TestNewHTTPClientUsesInstrumentedTransport(t *testing.T) {
	hc := NewHTTPClient(0)
	if hc.Transport == nil {
		t.Fatalf("expected non-nil transport")
	}
}
