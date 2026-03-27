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
type RunFunc func(ctx RunContext) (any, error)
```

The handler function type that every subcommand implements. The factory calls the
`RunFunc` after fully populating `RunContext`. The first return value is the data
payload written to the output envelope; `nil` is valid and produces a null `data`
field. A non-nil error is wrapped in a `CommandError` and rendered as a JSON error
envelope (or returned to Cobra in text mode).

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

    // Body is the raw request body supplied by the caller, either piped via
    // stdin or read from the path given to --file. Nil when no input was provided.
    Body []byte
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
5. Reads the request body from `--file` or piped stdin (mutually exclusive).
6. Calls `run(RunContext{...})` with the fully populated context.
7. Renders the result via `output.Render` — errors are written as a JSON envelope
   (or returned to Cobra in text mode). **Errors are never propagated raw to Cobra
   from inside this package.**

**Error conditions** (all routed through `output.Render`, not returned raw to Cobra):

| Condition | Error code | Error message pattern |
|---|---|---|
| `$ELASTIC_CONFIG` set, file not found | `config_error` | `$ELASTIC_CONFIG path not found: <os error>` |
| Config file exists, unreadable | `config_error` | `read config <path>: <os error>` |
| Config file exists, malformed YAML | `config_error` | `parse config <path>: <yaml error>` |
| `--context` names unknown context | `context_not_found` | `context "<name>" not found; available: [a, b, c]` |
| Both `--file` and piped stdin provided | `input_error` | `cannot use both stdin and --file as input; provide only one` |
| `--file` path unreadable | `input_error` | `read --file "<path>": <os error>` |
| Unsupported `--format` value | `invalid_argument` | `unsupported format "<v>": supported values are "text" and "json"` |

**Not an error**: config file absent or config directory absent → zero-value
`Config` used silently.

---

## `--context` global flag

Registered on `rootCmd` via `PersistentFlags()` in `cmd/root.go`:

```go
var contextFlag string

rootCmd.PersistentFlags().StringVar(
    &contextFlag,
    "context", "",
    "Context to use for this command",
)
```

The flag value is passed into the factory's context resolution step. When empty,
`Config.CurrentContext` is used.

---

## Error propagation model

All errors from format validation, config loading, context resolution, input
reading, and the `RunFunc` itself are handled **inside `RunE`** by calling
`output.Render`. In JSON mode, a JSON error envelope is written to stdout and
`RunE` returns `nil` (Cobra sees no error). In text mode, the error is returned
from `RunE` so that Cobra/`executeRoot` can write it to stderr and exit non-zero.
No `os.Exit` calls appear inside `internal/factory`.

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
    return factory.New("ping", "Check Elasticsearch connectivity", func(ctx factory.RunContext) (any, error) {
        es := ctx.Config.Contexts[ctx.ActiveContext].Elasticsearch
        return fmt.Sprintf("pinging %s (context: %s)", es.URL, ctx.ActiveContext), nil
    })
}
```

Registered in root:
```go
rootCmd.AddCommand(newPingCmd())
```
