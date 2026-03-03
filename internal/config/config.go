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

	var cfg Config
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		// Backward-compat: older initial templates included an empty config stub at the end
		// (current-context + contexts). If a user later added a real config above it,
		// YAML has duplicate keys and fails to parse. Try stripping that stub.
		if repaired := tryRepairTemplateStub(b); repaired != nil {
			var cfg2 Config
			if err2 := yaml.Unmarshal(repaired, &cfg2); err2 == nil {
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
