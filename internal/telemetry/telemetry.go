package telemetry

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

type contextKey int

const commandSpanContextKey contextKey = iota

func Init(ctx context.Context) (func(context.Context) error, error) {
	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName("elastic-cli"),
		),
	)
	if err != nil {
		return nil, err
	}
	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tracerProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	return tracerProvider.Shutdown, nil
}

func ExtractContextFromEnvironment(ctx context.Context) context.Context {
	carrier := propagation.MapCarrier{}
	for _, key := range []string{"TRACEPARENT", "TRACESTATE", "BAGGAGE"} {
		value := strings.TrimSpace(os.Getenv(key))
		if value != "" {
			carrier.Set(strings.ToLower(key), value)
		}
	}
	return otel.GetTextMapPropagator().Extract(ctx, carrier)
}

func StartCommandSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) context.Context {
	tracer := otel.Tracer("github.com/elastic/cli")
	ctx, span := tracer.Start(
		ctx,
		name,
		trace.WithSpanKind(trace.SpanKindInternal),
		trace.WithAttributes(attrs...),
	)
	return context.WithValue(ctx, commandSpanContextKey, span)
}

func EndCommandSpan(ctx context.Context, err error) {
	span, ok := ctx.Value(commandSpanContextKey).(trace.Span)
	if !ok || span == nil {
		return
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	span.End()
}

func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: InstrumentTransport(nil),
	}
}

func InstrumentTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return otelhttp.NewTransport(base)
}
