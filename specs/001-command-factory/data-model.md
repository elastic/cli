# Data Model: Command Factory with Config Loading

**Branch**: `001-command-factory` | **Date**: 2026-03-26

---

## Entity: Config

**Package**: `internal/factory`
**Owns**: top-level config file structure

```go
type Config struct {
    CurrentContext string             `yaml:"current_context"`
    Contexts       map[string]Context `yaml:"contexts"`
}
```

| Field            | Type                  | YAML key          | Default       | Notes                                      |
|------------------|-----------------------|-------------------|---------------|--------------------------------------------|
| `CurrentContext` | `string`              | `current_context` | `""`          | Empty = no default context; handlers must  |
|                  |                       |                   |               | tolerate this when no config exists        |
| `Contexts`       | `map[string]Context`  | `contexts`        | empty map     | Keys are arbitrary context names           |

**Validation rules**:
- No validation at load time; loading an empty or partial config is always valid.
- Context name resolution (checking `CurrentContext` exists in `Contexts`) happens
  in the factory pre-run, not in `Load()`.

**State**: immutable after loading — `Load()` returns a value, not a pointer.

---

## Entity: Context

**Package**: `internal/factory`
**Owns**: a single named context's connection settings

```go
type Context struct {
    Elasticsearch ElasticsearchConfig `yaml:"elasticsearch"`
}
```

| Field           | Type                   | YAML key        | Notes                              |
|-----------------|------------------------|-----------------|------------------------------------|
| `Elasticsearch` | `ElasticsearchConfig`  | `elasticsearch` | Required for ES operations; zero   |
|                 |                        |                 | value is valid (no-auth localhost) |

**Future extension**: additional service blocks (`Kibana`, `Fleet`, etc.) can be
added as new fields on `Context` without breaking existing config files (unknown
fields are silently ignored on read; missing fields are zero-valued).

---

## Entity: ElasticsearchConfig

**Package**: `internal/factory`
**Owns**: Elasticsearch connection parameters, including mutually exclusive auth modes

```go
type ElasticsearchConfig struct {
    URL      string `yaml:"url"`
    Username string `yaml:"username,omitempty"`
    Password string `yaml:"password,omitempty"`
    APIKey   string `yaml:"api_key,omitempty"`
}
```

| Field      | Type     | YAML key   | Default | Notes                                        |
|------------|----------|------------|---------|----------------------------------------------|
| `URL`      | `string` | `url`      | `""`    | Empty = no URL configured                    |
| `Username` | `string` | `username` | `""`    | Basic auth — pair with `Password`            |
| `Password` | `string` | `password` | `""`    | Basic auth — pair with `Username`            |
| `APIKey`   | `string` | `api_key`  | `""`    | API key auth — mutually exclusive with basic |

**Auth mode validation** (`AuthMode() (string, error)`):

| `Username`/`Password` | `APIKey` | Result                    |
|-----------------------|----------|---------------------------|
| both set              | empty    | `"basic"`, nil            |
| both empty            | set      | `"api_key"`, nil          |
| all empty             | empty    | `"none"`, nil             |
| any set               | set      | `""`, error (conflict)    |
| one of pair missing   | empty    | `""`, error (incomplete)  |

**Note**: `"none"` is valid — open/anonymous clusters are a supported use case.

---

## Entity: RunContext

**Package**: `internal/factory`
**Owns**: the per-invocation execution context passed to every handler

```go
type RunContext struct {
    Config        Config
    ConfigPath    string
    ActiveContext string
}
```

| Field           | Type     | Set by              | Notes                                              |
|-----------------|----------|---------------------|----------------------------------------------------|
| `Config`        | `Config` | factory pre-run     | Full loaded config (or zero-value if no file)      |
| `ConfigPath`    | `string` | factory pre-run     | Resolved file path; empty string if defaults used  |
| `ActiveContext` | `string` | factory pre-run     | `--context` flag if set, else `Config.CurrentContext` |

**Extension contract**: future cross-cutting fields (e.g., `DryRun bool`,
`OutputFormat string`) are added here. Existing handlers that don't read new
fields are unaffected — no handler signature change required.

---

## Entity: RunFunc

**Package**: `internal/factory`
**Owns**: the handler function type every subcommand implements

```go
type RunFunc func(ctx RunContext) error
```

Every factory-produced command wraps a `RunFunc`. The factory calls it after
populating `RunContext`. A non-nil error returned from `RunFunc` propagates to
Cobra's error handler (root command → stderr + non-zero exit).

---

## Config file lifecycle

```
Disk (YAML)
    │
    ▼ resolveConfigPath()
Path resolution
    │  precedence: $ELASTIC_CONFIG → $XDG_CONFIG_HOME → ~/.config → %APPDATA%
    │
    ▼ os.ReadFile()
Raw bytes  (missing file → zero Config + empty ConfigPath, no error)
    │
    ▼ yaml.Unmarshal() onto defaultConfig()
Config value  (malformed → error; unknown fields → silently ignored)
    │
    ▼ context resolution
ActiveContext  (--context flag → validate exists; else CurrentContext)
    │
    ▼ RunContext{Config, ConfigPath, ActiveContext}
Handler
```

---

## Config file example

```yaml
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

  open:
    elasticsearch:
      url: http://localhost:9200
      # no credentials — "none" auth mode
```
