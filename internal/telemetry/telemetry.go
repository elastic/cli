package telemetry

import (
	"context"
	"net/http"
	"os"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func Init(ctx context.Context) (func(context.Context) error, error) {
	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}
	res, err := resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
		resource.WithAttributes(attribute.String("service.name", "elastic-cli")),
	)
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithBatcher(exporter),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	return tp.Shutdown, nil
}

func ExtractContextFromEnv(ctx context.Context) context.Context {
	carrier := propagation.MapCarrier{}
	for _, key := range []string{"TRACEPARENT", "TRACESTATE", "BAGGAGE"} {
		value := strings.TrimSpace(os.Getenv(key))
		if value != "" {
			carrier[strings.ToLower(key)] = value
		}
	}
	if len(carrier) == 0 {
		return ctx
	}
	propagator := propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	)
	return propagator.Extract(ctx, carrier)
}

func StartCommandSpan(ctx context.Context, commandPath, contextName, format string, args []string) (context.Context, trace.Span) {
	attrs := []attribute.KeyValue{
		attribute.String("cli.command", commandPath),
		attribute.StringSlice("cli.args", args),
	}
	if strings.TrimSpace(contextName) != "" {
		attrs = append(attrs, attribute.String("cli.context", contextName))
	}
	if strings.TrimSpace(format) != "" {
		attrs = append(attrs, attribute.String("cli.format", format))
	}
	return otel.Tracer("github.com/elastic/cli").Start(ctx, commandPath, trace.WithAttributes(attrs...))
}

func NewTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return otelhttp.NewTransport(base)
}
