# Research: Command Factory with Config Loading

**Branch**: `001-command-factory` | **Date**: 2026-03-26

## Decision 1: YAML parsing library

**Decision**: `gopkg.in/yaml.v3`

**Rationale**: De-facto standard in the Go ecosystem; used by kubectl, Helm, and the
CNCF toolchain. `go.yaml.in/yaml/v3` is the same codebase under a newer module path
(~2024) but has negligible ecosystem adoption — selecting it adds migration risk for
zero functional gain. Constitution Principle VI ("minimal, well-established
libraries") makes this unambiguous.

**Alternatives considered**:
- `go.yaml.in/yaml/v3` — same code, new module path, insufficient adoption yet
- `sigs.k8s.io/yaml` — wraps `gopkg.in/yaml.v2` + JSON bridge; unnecessary
  complexity for this use case
- Go stdlib — no YAML support; third-party library strictly required here

**Key behaviours relied upon**:
- Unknown fields are silently ignored **by default** — FR-008 is free with no extra
  code. (`KnownFields(true)` must NOT be set.)
- Pre-populating the struct before `yaml.Unmarshal` is the correct pattern for
  defaults: the decoder only overwrites fields present in the document, leaving
  pre-populated values untouched for absent keys.
- `omitempty` is marshal-only and has no effect on unmarshalling.
- YAML 1.1 coercion: bare `on`/`off`/`yes`/`no` become booleans. Avoid these as
  string values in config; document accordingly.

**Default-loading pattern**:
```go
func defaultConfig() Config {
    return Config{
        CurrentContext: "",
        Contexts:       map[string]Context{},
    }
}

func load(data []byte) (Config, error) {
    cfg := defaultConfig()
    if err := yaml.Unmarshal(data, &cfg); err != nil {
        return Config{}, fmt.Errorf("parse config: %w", err)
    }
    return cfg, nil
}
```

---

## Decision 2: Cross-platform config path resolution

**Decision**: stdlib only — `os.Getenv`, `os.UserHomeDir`, `runtime.GOOS`

**Rationale**: Constitution Principle VI requires confirming stdlib cannot satisfy
the need before adding a dependency. It can: path resolution is straightforward with
the above three functions. No third-party XDG library is needed.

**Resolution precedence** (highest to lowest):

```
1. $ELASTIC_CONFIG      → use as literal file path; hard error if not found
2. $XDG_CONFIG_HOME     → $XDG_CONFIG_HOME/elastic/config.yml  (Linux + macOS)
3. ~/.config/           → ~/.config/elastic/config.yml          (Linux + macOS)
4. %APPDATA%\           → %APPDATA%\elastic\config.yml          (Windows)
```

**Implementation outline**:
```go
func resolveConfigPath() (string, error) {
    // 1. Explicit override
    if p := os.Getenv("ELASTIC_CONFIG"); p != "" {
        if _, err := os.Stat(p); os.IsNotExist(err) {
            return "", fmt.Errorf("$ELASTIC_CONFIG path not found: %s", p)
        }
        return p, nil
    }

    // 2. XDG / OS-native base dir
    var base string
    switch runtime.GOOS {
    case "windows":
        base = os.Getenv("APPDATA")
        if base == "" {
            return "", fmt.Errorf("%%APPDATA%% is not set")
        }
    default: // linux, darwin, etc.
        if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
            base = xdg
        } else {
            home, err := os.UserHomeDir()
            if err != nil {
                return "", fmt.Errorf("cannot determine home directory: %w", err)
            }
            base = filepath.Join(home, ".config")
        }
    }
    return filepath.Join(base, "elastic", "config.yml"), nil
}
```

**$ELASTIC_CONFIG non-existent** → hard error (FR-011), not silent fallback.
Distinguishes deliberate-but-broken override from simply absent config.

**Config dir does not exist** → treat the same as missing file; use defaults
(the directory not existing is not an error condition).

---

## Decision 3: Config struct — auth mode representation

**Decision**: Flat struct with `omitempty` string fields + `Validate()` method

**Rationale**: The two auth modes (basic: url+username+password; API key: url+api_key)
differ only by which fields are present. A flat struct is simpler to unmarshal,
inspect, and test than a tagged union or interface. Validation is deferred to an
explicit `Validate()` call rather than happening inside `Unmarshal`, keeping the
loader and validator as separate, testable concerns.

**Go struct**:
```go
type ElasticsearchConfig struct {
    URL      string `yaml:"url"`
    Username string `yaml:"username,omitempty"`
    Password string `yaml:"password,omitempty"`
    APIKey   string `yaml:"api_key,omitempty"`
}

// AuthMode returns the resolved authentication mode or an error if the
// combination of credentials is invalid.
func (e ElasticsearchConfig) AuthMode() (string, error) {
    hasBasic  := e.Username != "" || e.Password != ""
    hasAPIKey := e.APIKey != ""
    switch {
    case hasBasic && hasAPIKey:
        return "", errors.New("cannot specify both basic auth and api_key")
    case hasBasic:
        if e.Username == "" || e.Password == "" {
            return "", errors.New("basic auth requires both username and password")
        }
        return "basic", nil
    case hasAPIKey:
        return "api_key", nil
    default:
        return "none", nil // no auth — valid for open clusters
    }
}
```

**Validation timing**: `Validate()` (or `AuthMode()`) is called during factory
initialisation before the handler executes, so misconfigured credentials are caught
eagerly rather than at the first API call.

**Alternatives considered**:
- Interface/discriminated union — over-engineered for two modes; complicates YAML
  unmarshalling
- Validation inside `Unmarshal` via custom `UnmarshalYAML` — mixes concerns;
  harder to test parsing and validation independently

---

## Decision 4: `--context` persistent flag — Cobra registration

**Decision**: Register on `rootCmd` via `PersistentFlags()` before `Execute()`

**Rationale**: Cobra's `PersistentFlags` are inherited by every subcommand, so a
single registration on the root command satisfies FR-012 with no per-subcommand
boilerplate. The flag value is read during factory pre-run to determine
`ActiveContext`.

**Implementation outline**:
```go
// cmd/root.go
var contextFlag string

func init() {
    rootCmd.PersistentFlags().StringVar(&contextFlag, "context", "",
        "override the active context for this invocation")
}
```

The factory reads `contextFlag` (or receives it via a resolver function) in its
pre-run hook and sets `RunContext.ActiveContext` to the flag value if non-empty,
falling back to `Config.CurrentContext`.

**Unknown context name** → hard error listing available contexts (edge case from
spec). Validated after config is loaded and before handler executes.

---

## Decision 5: Package layout

**Decision**: `internal/factory/` with config and path resolution as sub-files
within the same package

**Rationale**: The spec states the factory owns the `Config` type. Keeping all
related types in one package avoids circular imports and keeps the public surface
area small. `internal/` ensures the package cannot be imported by code outside this
module, which is correct for a CLI binary's core plumbing.

**Layout**:
```
internal/factory/
├── factory.go       # New(), RunFunc, RunContext
├── factory_test.go
├── config.go        # Config, Context, ElasticsearchConfig, Load()
├── config_test.go
├── path.go          # resolveConfigPath()
└── path_test.go
```

The `cmd/` package imports `internal/factory` to wire the factory into the Cobra
command tree and register the `--context` flag.
