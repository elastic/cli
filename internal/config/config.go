package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

const (
	dirName      = "elastic"
	configName   = "config.yaml"
	dirPerms     = 0o700
	configPerms  = 0o600
	backupSuffix = ".bak"
)

type Context struct {
	CloudID          string `yaml:"cloud_id,omitempty"`
	APIKey           string `yaml:"api_key,omitempty"`
	Username         string `yaml:"username,omitempty"`
	Password         string `yaml:"password,omitempty"`
	ElasticsearchURL string `yaml:"elasticsearch_url,omitempty"`
	KibanaURL        string `yaml:"kibana_url,omitempty"`
}

type Config struct {
	CurrentContext string             `yaml:"current-context,omitempty"`
	Contexts       map[string]Context `yaml:"contexts,omitempty"`
	otelRaw        []byte
}

// OTelYAML returns the raw YAML bytes for the otel config section,
// suitable for passing to otelconf.ParseYAML. Returns nil if no otel
// config is present.
func (c Config) OTelYAML() ([]byte, error) {
	return c.otelRaw, nil
}

func DefaultPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("get user config dir: %w", err)
	}
	return filepath.Join(base, dirName, configName), nil
}

func Load(path string) (Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Config{Contexts: map[string]Context{}}, nil
		}
		return Config{}, fmt.Errorf("read config: %w", err)
	}

	cfg, err := unmarshalConfig(b)
	if err != nil {
		if repaired := tryRepairTemplateStub(b); repaired != nil {
			cfg2, err2 := unmarshalConfig(repaired)
			if err2 == nil {
				cfg = cfg2
			} else {
				return Config{}, fmt.Errorf("parse yaml: %w", err)
			}
		} else {
			return Config{}, fmt.Errorf("parse yaml: %w", err)
		}
	}
	if cfg.Contexts == nil {
		cfg.Contexts = map[string]Context{}
	}
	return cfg, nil
}

func unmarshalConfig(b []byte) (Config, error) {
	var cfg Config
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		return Config{}, err
	}
	cfg.otelRaw = extractOTelYAML(b)
	return cfg, nil
}

// extractOTelYAML parses the raw config bytes as a YAML document tree,
// finds the "otel" mapping key, and marshals its value back to standalone
// YAML suitable for otelconf.ParseYAML.
func extractOTelYAML(b []byte) []byte {
	var doc yaml.Node
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return nil
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(root.Content); i += 2 {
		if root.Content[i].Value == "otel" {
			out, err := yaml.Marshal(root.Content[i+1])
			if err != nil {
				return nil
			}
			return out
		}
	}
	return nil
}

func Save(path string, cfg Config) error {
	if cfg.Contexts == nil {
		cfg.Contexts = map[string]Context{}
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, dirPerms); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	out, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("marshal yaml: %w", err)
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out, configPerms); err != nil {
		return fmt.Errorf("write temp config: %w", err)
	}

	// Best-effort backup before replace.
	if _, err := os.Stat(path); err == nil {
		_ = copyFile(path, path+backupSuffix, configPerms)
	}

	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

// EnsureInitialized creates a default config file (with commented examples)
// if it does not already exist. It never overwrites an existing file.
//
// It returns true when a file was created.
func EnsureInitialized(path string) (bool, error) {
	if _, err := os.Stat(path); err == nil {
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, fmt.Errorf("stat config: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, dirPerms); err != nil {
		return false, fmt.Errorf("create config dir: %w", err)
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, configPerms)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			return false, nil
		}
		return false, fmt.Errorf("create config: %w", err)
	}
	defer f.Close()

	template := defaultConfigTemplate()
	if _, err := f.WriteString(template); err != nil {
		_ = os.Remove(path)
		return false, fmt.Errorf("write config template: %w", err)
	}
	return true, nil
}

func defaultConfigTemplate() string {
	// Keep this file valid YAML while also being a helpful guide for first-time users.
	// Everything in the example is commented out. We intentionally do not include an
	// "empty config" YAML mapping to avoid duplicate-key parse errors if a user later
	// adds their own config below/above the example.
	lines := []string{
		"# elastic configuration",
		"#",
		"# Quickstart:",
		"#   elastic config context set prod --cloud-id '...' --api-key '...'",
		"#   elastic config context use prod",
		"#",
		"# You can also edit this file directly. Example:",
		"#",
		"# current-context: prod",
		"# contexts:",
		"#   prod:",
		"#     cloud_id: \"deployment-name:base64...\"",
		"#     api_key: \"encoded-api-key\"",
		"#   local:",
		"#     elasticsearch_url: \"https://localhost:9200\"",
		"#     kibana_url: \"https://localhost:5601\"   # optional (needed for Kibana APIs like SLOs)",
		"#     api_key: \"encoded-api-key\"              # or set username/password instead",
		"#     username: \"elastic\"",
		"#     password: \"...\"",
		"#",
		"# OpenTelemetry (opt-in):",
		"# otel:",
		"#   file_format: \"0.3\"",
		"#   tracer_provider:",
		"#     processors:",
		"#       - batch:",
		"#           exporter:",
		"#             otlp_http:",
		"#               endpoint: http://localhost:4318",
		"#",
		"",
	}
	return strings.Join(lines, "\n")
}

func tryRepairTemplateStub(b []byte) []byte {
	s := string(b)
	// Only attempt repair for files that look like they came from our template.
	if !strings.Contains(s, "# elastic configuration") {
		return nil
	}

	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	removed := 0
	for _, line := range lines {
		switch strings.TrimRight(line, " \t") {
		case `current-context: ""`, "contexts: {}":
			removed++
			continue
		default:
			out = append(out, line)
		}
	}
	if removed == 0 {
		return nil
	}

	// Trim trailing empty lines.
	for len(out) > 0 && strings.TrimSpace(out[len(out)-1]) == "" {
		out = out[:len(out)-1]
	}
	out = append(out, "")
	return []byte(strings.Join(out, "\n"))
}

func copyFile(src, dst string, mode fs.FileMode) error {
	b, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, b, mode)
}
