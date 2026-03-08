package telemetry

import (
	"context"
	"testing"

	"go.opentelemetry.io/contrib/otelconf"
	"go.opentelemetry.io/otel/trace"
)

func TestExtractContextFromEnv(t *testing.T) {
	t.Setenv("TRACEPARENT", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	ctx := ExtractContextFromEnv(context.Background())
	if got := trace.SpanContextFromContext(ctx); !got.IsValid() {
		t.Fatal("expected valid span context")
	}
}

func TestEnsureDefaultServiceName_noResource(t *testing.T) {
	cfg := &otelconf.OpenTelemetryConfiguration{}
	ensureDefaultServiceName(cfg)

	if cfg.Resource == nil {
		t.Fatal("expected Resource to be created")
	}
	if len(cfg.Resource.Attributes) != 1 {
		t.Fatalf("expected 1 attribute, got %d", len(cfg.Resource.Attributes))
	}
	attr := cfg.Resource.Attributes[0]
	if attr.Name != "service.name" || attr.Value != defaultServiceName {
		t.Fatalf("got %s=%v, want service.name=%s", attr.Name, attr.Value, defaultServiceName)
	}
}

func TestEnsureDefaultServiceName_emptyAttributes(t *testing.T) {
	cfg := &otelconf.OpenTelemetryConfiguration{
		Resource: &otelconf.Resource{},
	}
	ensureDefaultServiceName(cfg)

	if len(cfg.Resource.Attributes) != 1 {
		t.Fatalf("expected 1 attribute, got %d", len(cfg.Resource.Attributes))
	}
	if cfg.Resource.Attributes[0].Name != "service.name" {
		t.Fatalf("expected service.name, got %s", cfg.Resource.Attributes[0].Name)
	}
}

func TestEnsureDefaultServiceName_userOverride(t *testing.T) {
	cfg := &otelconf.OpenTelemetryConfiguration{
		Resource: &otelconf.Resource{
			Attributes: []otelconf.AttributeNameValue{
				{Name: "service.name", Value: "my-custom-service"},
			},
		},
	}
	ensureDefaultServiceName(cfg)

	if len(cfg.Resource.Attributes) != 1 {
		t.Fatalf("expected 1 attribute, got %d", len(cfg.Resource.Attributes))
	}
	if cfg.Resource.Attributes[0].Value != "my-custom-service" {
		t.Fatalf("expected user value preserved, got %v", cfg.Resource.Attributes[0].Value)
	}
}

func TestEnsureDefaultServiceName_preservesOtherAttributes(t *testing.T) {
	cfg := &otelconf.OpenTelemetryConfiguration{
		Resource: &otelconf.Resource{
			Attributes: []otelconf.AttributeNameValue{
				{Name: "deployment.environment", Value: "production"},
			},
		},
	}
	ensureDefaultServiceName(cfg)

	if len(cfg.Resource.Attributes) != 2 {
		t.Fatalf("expected 2 attributes, got %d", len(cfg.Resource.Attributes))
	}
	var found bool
	for _, attr := range cfg.Resource.Attributes {
		if attr.Name == "service.name" && attr.Value == defaultServiceName {
			found = true
		}
	}
	if !found {
		t.Fatal("default service.name not appended")
	}
}
