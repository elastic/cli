package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOTelYAML(t *testing.T) {
	content := `current-context: test
contexts:
  test:
    elasticsearch_url: "http://localhost:9200"
    username: elastic
    password: elastic
otel:
  file_format: "0.3"
  tracer_provider:
    processors:
      - batch:
          exporter:
            otlp:
              endpoint: http://localhost:4318
`
	tmp := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(tmp)
	if err != nil {
		t.Fatal("load:", err)
	}
	b, err := cfg.OTelYAML()
	if err != nil {
		t.Fatal("OTelYAML:", err)
	}
	if len(b) == 0 {
		t.Fatal("OTelYAML returned empty bytes")
	}
	t.Logf("OTelYAML output:\n%s", string(b))
}

func TestOTelYAML_absent(t *testing.T) {
	content := `current-context: test
contexts:
  test:
    elasticsearch_url: "http://localhost:9200"
    username: elastic
    password: elastic
`
	tmp := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(tmp, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(tmp)
	if err != nil {
		t.Fatal("load:", err)
	}
	b, err := cfg.OTelYAML()
	if err != nil {
		t.Fatal("OTelYAML:", err)
	}
	if len(b) != 0 {
		t.Fatalf("expected nil/empty bytes, got: %s", string(b))
	}
}
