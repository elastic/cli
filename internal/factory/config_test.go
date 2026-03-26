package factory

import (
	"os"
	"runtime"
	"strings"
	"testing"

	"github.com/elastic/cli/internal/factory/factorytest"
)

// ---- struct unmarshalling ---------------------------------------------------

func TestConfig_YAMLUnmarshal(t *testing.T) {
	// Example config from data-model.md: two contexts, basic auth + api_key
	yaml := `
current_context: prod

contexts:
  prod:
    elasticsearch:
      url: https://my-cluster.es.io
      username: elastic
      password: s3cr3t
  dev:
    elasticsearch:
      url: http://localhost:9200
      api_key: abc123==
`
	path := factorytest.TempConfigFile(t, []byte(yaml))
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.CurrentContext != "prod" {
		t.Errorf("CurrentContext: got %q, want %q", cfg.CurrentContext, "prod")
	}
	if len(cfg.Contexts) != 2 {
		t.Fatalf("len(Contexts): got %d, want 2", len(cfg.Contexts))
	}

	prod := cfg.Contexts["prod"].Elasticsearch
	if prod.URL != "https://my-cluster.es.io" {
		t.Errorf("prod URL: got %q, want %q", prod.URL, "https://my-cluster.es.io")
	}
	if prod.Username != "elastic" {
		t.Errorf("prod Username: got %q, want %q", prod.Username, "elastic")
	}
	if prod.Password != "s3cr3t" {
		t.Errorf("prod Password: got %q, want %q", prod.Password, "s3cr3t")
	}

	dev := cfg.Contexts["dev"].Elasticsearch
	if dev.URL != "http://localhost:9200" {
		t.Errorf("dev URL: got %q, want %q", dev.URL, "http://localhost:9200")
	}
	if dev.APIKey != "abc123==" {
		t.Errorf("dev APIKey: got %q, want %q", dev.APIKey, "abc123==")
	}
}

// ---- defaultConfig ----------------------------------------------------------

func TestDefaultConfig(t *testing.T) {
	cfg := defaultConfig()
	if cfg.Contexts == nil {
		t.Error("defaultConfig().Contexts is nil, want non-nil empty map")
	}
	if len(cfg.Contexts) != 0 {
		t.Errorf("defaultConfig().Contexts length: got %d, want 0", len(cfg.Contexts))
	}
	if cfg.CurrentContext != "" {
		t.Errorf("defaultConfig().CurrentContext: got %q, want empty string", cfg.CurrentContext)
	}
}

// ---- Load -------------------------------------------------------------------

func TestLoad_ValidFile(t *testing.T) {
	yaml := `
current_context: dev
contexts:
  dev:
    elasticsearch:
      url: http://localhost:9200
`
	path := factorytest.TempConfigFile(t, []byte(yaml))
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.CurrentContext != "dev" {
		t.Errorf("CurrentContext: got %q, want %q", cfg.CurrentContext, "dev")
	}
}

func TestLoad_EmptyFile_ReturnsDefaults(t *testing.T) {
	path := factorytest.TempConfigFile(t, []byte(""))
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := defaultConfig()
	if cfg.CurrentContext != want.CurrentContext {
		t.Errorf("CurrentContext: got %q, want %q", cfg.CurrentContext, want.CurrentContext)
	}
	if cfg.Contexts == nil {
		t.Error("Contexts is nil, want non-nil empty map")
	}
}

func TestLoad_MalformedYAML_ErrorContainsPath(t *testing.T) {
	path := factorytest.TempConfigFile(t, []byte(":\tinvalid: yaml: ["))
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for malformed YAML, got nil")
	}
	if !strings.Contains(err.Error(), path) {
		t.Errorf("error %q should contain file path %q", err.Error(), path)
	}
}

func TestLoad_UnknownFields_Ignored(t *testing.T) {
	yaml := `
current_context: prod
unknown_top_level: ignored
contexts:
  prod:
    elasticsearch:
      url: http://localhost:9200
      unknown_field: also_ignored
`
	path := factorytest.TempConfigFile(t, []byte(yaml))
	_, err := Load(path)
	if err != nil {
		t.Errorf("unexpected error for unknown fields: %v", err)
	}
}

func TestLoad_NonExistentPath_ReturnsDefaults(t *testing.T) {
	path := "/nonexistent/path/config.yml"
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error for missing file: %v", err)
	}
	want := defaultConfig()
	if cfg.CurrentContext != want.CurrentContext {
		t.Errorf("CurrentContext: got %q, want %q", cfg.CurrentContext, want.CurrentContext)
	}
	if cfg.Contexts == nil {
		t.Error("Contexts is nil, want non-nil empty map")
	}
}

func TestLoad_UnreadableFile_ErrorContainsPathAndPermission(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("chmod 000 does not reliably prevent reads on Windows")
	}
	path := factorytest.TempConfigFileUnreadable(t, []byte("current_context: prod"))
	defer func() { _ = os.Chmod(path, 0644) }()

	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for unreadable file, got nil")
	}
	if !strings.Contains(err.Error(), path) {
		t.Errorf("error %q should contain file path %q", err.Error(), path)
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("error %q should contain 'permission denied'", err.Error())
	}
}