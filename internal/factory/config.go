package factory

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config represents the full contents of the CLI config file.
// The zero value is valid and represents "no config file present, all defaults in effect."
type Config struct {
	// CurrentContext is the name of the default context used when --context is
	// not supplied. An empty string means no default context is set.
	CurrentContext string `yaml:"current_context"`

	// Contexts holds every named context keyed by its name.
	Contexts map[string]Context `yaml:"contexts"`
}

// Context groups the connection settings for a single named context.
// Additional service blocks (e.g. Kibana) may be added as new fields in future
// without breaking existing config files.
type Context struct {
	Elasticsearch ElasticsearchConfig `yaml:"elasticsearch"`
}

// ElasticsearchConfig holds connection parameters for an Elasticsearch endpoint.
// The three supported auth modes are mutually exclusive:
//   - basic auth: URL + Username + Password
//   - API key:    URL + APIKey
//   - none:       URL only (open or anonymous cluster)
type ElasticsearchConfig struct {
	// URL is the Elasticsearch endpoint, e.g. "https://my-cluster.es.io".
	URL string `yaml:"url"`

	// Username and Password are used together for HTTP basic auth.
	// Providing only one of the pair is treated as no auth (both must be set).
	Username string `yaml:"username,omitempty"`
	Password string `yaml:"password,omitempty"`

	// APIKey is mutually exclusive with Username/Password.
	// Any non-empty value here activates API key auth.
	APIKey string `yaml:"api_key,omitempty"`
}

// defaultConfig returns a Config with all fields at their zero values except
// Contexts, which is initialised to a non-nil empty map.
func defaultConfig() Config {
	return Config{
		Contexts: make(map[string]Context),
	}
}

// Load reads and parses the config file at path.
//
// If the file does not exist, Load returns defaultConfig() and a nil error
// (missing config is not an error — the caller uses defaults).
//
// Any other read failure (e.g. permission denied) or a YAML parse error is
// returned as a wrapped error that includes the file path.
func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultConfig(), nil
		}
		return Config{}, fmt.Errorf("read config %s: %w", path, err)
	}

	cfg := defaultConfig()
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config %s: %w", path, err)
	}
	// yaml.v3 silently ignores unknown fields by default — no extra option needed.
	// Ensure Contexts is never nil even when the YAML omits it entirely.
	if cfg.Contexts == nil {
		cfg.Contexts = make(map[string]Context)
	}
	return cfg, nil
}
