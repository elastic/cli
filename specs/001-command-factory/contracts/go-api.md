# Go Package API Contract: `internal/factory`

**Package path**: `github.com/elastic/cli/internal/factory`
**Type**: Internal library — consumed by `cmd/` package only

This document defines the complete public API surface of the `internal/factory`
package. Any change to a symbol below is a breaking change to the `cmd/` layer and
requires updating all call sites.

---

## Types

### `RunFunc`

```go
type RunFunc func(ctx RunContext) error
```

The handler function type that every subcommand implements. The factory calls the
`RunFunc` after fully populating `RunContext`. A non-nil return value is propagated
to Cobra as a command error (root command writes to stderr, exits non-zero).

---

### `RunContext`

```go
type RunContext struct {
    // Config is the full configuration loaded from disk (or zero-value defaults).
    Config Config

    // ConfigPath is the resolved filesystem path of the loaded config file.
    // Empty string when no config file was found and defaults are in use.
    ConfigPath string

    // ActiveContext is the resolved context name for this invocation.
    // Set from the --context flag if provided; otherwise from Config.CurrentContext.
    ActiveContext string
}
```

**Stability note**: new fields may be added in future phases (e.g., `DryRun bool`).
Handlers that do not read new fields are unaffected.

---

### `Config`

```go
type Config struct {
    CurrentContext string            `yaml:"current_context"`
    Contexts       map[string]Context `yaml:"contexts"`
}
```

Represents the full contents of the config file. Zero-value is valid and represents
"no config file present, all defaults in effect."

---

### `Context`

```go
type Context struct {
    Elasticsearch ElasticsearchConfig `yaml:"elasticsearch"`
}
```

A named context grouping connection settings for one or more Elastic services.

---

### `ElasticsearchConfig`

```go
type ElasticsearchConfig struct {
    URL      string `yaml:"url"`
    Username string `yaml:"username,omitempty"`
    Password string `yaml:"password,omitempty"`
    APIKey   string `yaml:"api_key,omitempty"`
}
```

Connection parameters for Elasticsearch. Supports two mutually exclusive auth modes:
- **Basic auth**: `url` + `username` + `password`
- **API key**: `url` + `api_key`
- **None**: `url` only (open/anonymous cluster)

#### Method: `AuthMode() (string, error)`

```go
func (e ElasticsearchConfig) AuthMode() (string, error)
```

Returns `"basic"`, `"api_key"`, or `"none"`. Returns a non-nil error if:
- Both basic credentials and `api_key` are set (conflict)
- Only one of `username`/`password` is set (incomplete basic auth)

---

## Functions

### `New`

```go
func New(name, description string, run RunFunc) *cobra.Command
```

Creates a fully wired `*cobra.Command` from a minimal command definition.

**Behaviour**:
1. Resolves the config file path using the precedence chain:
   `$ELASTIC_CONFIG` → `$XDG_CONFIG_HOME/elastic/config.yml`
   → `~/.config/elastic/config.yml` → `%APPDATA%\elastic\config.yml` (Windows)
2. Reads and parses the config file. Unknown YAML fields are silently ignored.
   Missing file → zero-value `Config`, empty `ConfigPath`.
3. Resolves `ActiveContext` from `--context` flag (if set) or `Config.CurrentContext`.
4. Validates that `ActiveContext` exists in `Config.Contexts` when non-empty.
5. Calls `run(RunContext{...})` with the fully populated context.
6. Returns any error from `run` to Cobra.

**Error conditions** (all returned as Go `error`, not written directly to stderr):

| Condition | Error message pattern |
|---|---|
| `$ELASTIC_CONFIG` set, file not found | `$ELASTIC_CONFIG path not found: <path>` |
| Config file exists, unreadable | `read config <path>: <os error>` |
| Config file exists, malformed YAML | `parse config <path>: <yaml error>` |
| `--context` names unknown context | `context "<name>" not found; available: [a, b, c]` |

**Not an error**: config file absent or config directory absent → zero-value
`Config` used silently.

---

## `--context` global flag

Registered on `rootCmd` via `PersistentFlags()` in `cmd/root.go`:

```go
var contextOverride string

rootCmd.PersistentFlags().StringVar(
    &contextOverride,
    "context", "",
    "override the active context for this invocation",
)
```

The flag value is passed into the factory's context resolution step. When empty,
`Config.CurrentContext` is used.

---

## Error propagation model

All errors from config loading and context resolution are returned as Go `error`
values from the Cobra `RunE` function. The Cobra root command (already configured
with `SilenceUsage: true` for error cases) writes the error to stderr and exits
with code 1. No `os.Exit` calls appear inside `internal/factory`.

---

## Usage example

```go
// cmd/ping.go
package cmd

import (
    "fmt"
    "github.com/elastic/cli/internal/factory"
)

func newPingCmd() *cobra.Command {
    return factory.New("ping", "Check Elasticsearch connectivity", func(ctx factory.RunContext) error {
        es := ctx.Config.Contexts[ctx.ActiveContext].Elasticsearch
        fmt.Printf("pinging %s (context: %s)\n", es.URL, ctx.ActiveContext)
        return nil
    })
}
```

Registered in root:
```go
rootCmd.AddCommand(newPingCmd())
```
