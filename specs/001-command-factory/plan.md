# Implementation Plan: Command Factory with Config Loading

**Branch**: `001-command-factory` | **Date**: 2026-03-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/001-command-factory/spec.md`

## Summary

Build a command factory utility (`internal/factory`) that serves as the single
entry point for defining every CLI subcommand. Phase 1 scope: config file loading
from the OS-appropriate path, context resolution (including `--context` flag
override), and a `RunContext`-based handler pattern that provides a clear extension
point for future cross-cutting concerns.

Config format is kubectl-style named contexts in YAML. Factory is wired into the
existing Cobra root command in `cmd/`.

## Technical Context

**Language/Version**: Go 1.25.3
**Primary Dependencies**:
- `github.com/spf13/cobra v1.10.2` (already present)
- `gopkg.in/yaml.v3` (to be added — no stdlib YAML parser exists)

**Storage**: YAML file at OS-appropriate path; read-only in this phase
**Testing**: `go test ./...` (stdlib `testing` package)
**Target Platform**: Linux (CI-gated), macOS (manual verification), Windows (best-effort, no CI gate)
**Project Type**: CLI binary
**Performance Goals**: Config load < 10 ms (file I/O bound; no explicit target in spec)
**Constraints**: No unnecessary third-party deps; stdlib preferred (constitution Principle VI); `gopkg.in/yaml.v3` is the sole justified addition
**Scale/Scope**: Single config file, small N named contexts; no concurrency concerns

## Constitution Check

*GATE: Must pass before implementation. Re-checked after design.*

| Principle | Status | Notes |
|---|---|---|
| I — Config-Driven Commands | ✅ Compliant | Factory is the single, centralised command-definition mechanism; no bespoke per-command plumbing |
| II — Agent-First I/O | ⚠️ Deferred (justified) | `--format=json`, schema introspection not in this phase; `RunContext` extension point is the architectural foundation — see Complexity Tracking |
| III — Input Validation & `--dry-run` | ⚠️ Deferred (justified) | Validation pipeline and dry-run not in scope; deferred to next factory phase — see Complexity Tracking |
| IV — Context-Based Configuration | ✅ Compliant | Named contexts, `current_context`, `--context` override, credential-in-config model all implemented |
| V — Test-First (TDD) | ✅ Required | Red/green cycle enforced throughout; see task breakdown |
| VI — Minimal Dependencies | ✅ Compliant | Only `gopkg.in/yaml.v3` added; confirmed no stdlib alternative exists for YAML |

## Project Structure

### Documentation (this feature)

```text
specs/001-command-factory/
├── plan.md           ← this file
├── spec.md
├── research.md       ← Phase 0 output
├── data-model.go.md
├── contracts/
│   └── go-api.md     ← Phase 1 output
└── tasks.md          ← Phase 2 output (created by /speckit.tasks)
```

### Source Code

```text
internal/
└── factory/
    ├── factory.go        # New(), RunFunc type, RunContext struct
    ├── factory_test.go
    ├── config.go         # Config, Context, ElasticsearchConfig, Load(), defaultConfig()
    ├── config_test.go
    ├── path.go           # resolveConfigPath() — env + OS path resolution
    └── path_test.go

cmd/
├── root.go               # adds --context PersistentFlag, wires factory into tree
└── root_test.go          # existing tests + --context flag registration test
```

**Structure Decision**: Single project (Go CLI binary). New code lives under
`internal/factory/` (inaccessible outside this module, correct for CLI plumbing).
`cmd/` is the thin wiring layer; all logic lives in `internal/`.

## Design Decisions (from research.md)

### Config path resolution precedence

```
$ELASTIC_CONFIG          → literal file path (hard error if not found)
$XDG_CONFIG_HOME         → $XDG_CONFIG_HOME/elastic/config.yml  (Linux/macOS)
~/.config/               → ~/.config/elastic/config.yml          (Linux/macOS)
%APPDATA%\               → %APPDATA%\elastic\config.yml          (Windows)
```

Missing file / missing directory → zero-value `Config`, no error.

### Context resolution

```
--context flag (non-empty)  → validate exists in Config.Contexts → ActiveContext
Config.CurrentContext       → use as ActiveContext (may be empty)
```

Unknown context name → hard error: `context "<name>" not found; available: [...]`

### Auth modes (`ElasticsearchConfig`)

Two mutually exclusive modes validated via `AuthMode()`:
- `"basic"` — `url` + `username` + `password`
- `"api_key"` — `url` + `api_key`
- `"none"` — `url` only (anonymous/open cluster)

Conflict or incomplete basic credentials → `AuthMode()` returns error.

### Handler pattern

```go
type RunFunc func(ctx RunContext) error

type RunContext struct {
    Config        Config
    ConfigPath    string
    ActiveContext string
}
```

`RunContext` is the extension point: future fields (`DryRun`, `OutputFormat`, etc.)
are added without changing any existing handler signature.

### Error surfacing

All errors returned as Go `error` from `RunE`. Cobra root command writes to stderr,
exits non-zero. No `os.Exit` inside `internal/factory`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle II (Agent-First I/O) not implemented | Out of scope for this phase per spec; factory architecture (RunContext) is the prerequisite for Phase II | Implementing JSON I/O now would require schema definition work that belongs to a dedicated phase |
| Principle III (--dry-run / validation) not implemented | Out of scope for this phase per spec | Same rationale; RunContext `DryRun` field is reserved for Phase III |
