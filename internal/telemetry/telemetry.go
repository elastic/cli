package telemetry

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/contrib/otelconf"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

const defaultServiceName = "elastic-cli"

// Init initialises the OpenTelemetry SDK from the raw YAML bytes of the
// "otel" section of the CLI config file. When otelYAML is nil (no config
// present), telemetry is a no-op.
func Init(ctx context.Context, otelYAML []byte) (func(context.Context) error, error) {
	noop := func(context.Context) error { return nil }

	if len(otelYAML) == 0 {
		return noop, nil
	}

	cfg, err := otelconf.ParseYAML(otelYAML)
	if err != nil {
		return noop, fmt.Errorf("parse otel config: %w", err)
	}

	ensureDefaultServiceName(cfg)

	sdk, err := otelconf.NewSDK(
		otelconf.WithContext(ctx),
		otelconf.WithOpenTelemetryConfiguration(*cfg),
	)
	if err != nil {
		return noop, fmt.Errorf("init otel SDK: %w", err)
	}

	otel.SetTracerProvider(sdk.TracerProvider())
	otel.SetTextMapPropagator(sdk.Propagator())

	return sdk.Shutdown, nil
}

// ensureDefaultServiceName sets service.name to the default unless the
// user already configured one.
func ensureDefaultServiceName(cfg *otelconf.OpenTelemetryConfiguration) {
	if cfg.Resource == nil {
		cfg.Resource = &otelconf.Resource{}
	}
	for _, attr := range cfg.Resource.Attributes {
		if attr.Name == "service.name" {
			return
		}
	}
	cfg.Resource.Attributes = append(cfg.Resource.Attributes, otelconf.AttributeNameValue{
		Name:  "service.name",
		Value: defaultServiceName,
	})
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
