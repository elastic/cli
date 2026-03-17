# Implementation Plan: Core Utilities — Constitutional Foundations

**Branch**: `002-core-utils-constitution` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/002-core-utils-constitution/spec.md`

---

## Summary

Create a reusable `internal/cmdutil` package that provides three shared primitives — structured errors, context resolution, and dry-run support — then refactor all five `es`-family commands (`es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`, `es query`) to use them. No external dependencies are added. The refactor eliminates duplicated context-resolution blocks and wires up `--dry-run` uniformly across the `es` surface.

---

## Technical Context

**Language/Version**: Go 1.25.3
**Primary Dependencies**: `github.com/spf13/cobra` (existing), Go stdlib only for new utilities
**Storage**: YAML config file at `os.UserConfigDir()/elastic/config.yaml` (existing)
**Testing**: `go test ./...`, `go test -race`, `go test -cover`
**Target Platform**: Linux / macOS CLI
**Project Type**: CLI tool
**Performance Goals**: N/A (CLI latency dominated by network I/O)
**Constraints**: No new external dependencies (Principle VI); all utilities in `internal/`
**Scale/Scope**: ~5 commands refactored; 3 new utility files + tests

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ⚠️ PARTIAL | Full config-driven registration is deferred (per spec assumptions). This feature lays groundwork — no violation, deferred by design. |
| II. Agent-First I/O | ✅ PASS | `StructuredError` + `RenderError` ensure `{"error":{...}}` on `--format=json`. `--data` / `--help --format=json` schema introspection deferred. |
| III. Input Validation & Safety | ✅ PASS | `HandleDryRun` validates declared inputs; `StructuredError` is the hard-error path; `--dry-run` added to all `es` commands. |
| IV. Context-Based Configuration | ✅ PASS | `ResolveContext` centralises all context logic; credentials remain in config file only. |
| V. Test-First Development | ✅ PASS | TDD cycle required by constitution; tasks will enforce red/green order. |
| VI. Minimal Dependencies | ✅ PASS | Zero new external dependencies; stdlib only. |

**Post-design re-check**: No new violations introduced by Phase 1 design. Partial compliance on Principle I is pre-existing and explicitly deferred in the spec.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-core-utils-constitution/
├── plan.md            ← this file
├── research.md        ← Phase 0 output ✅
├── data-model.md      ← Phase 1 output ✅
├── quickstart.md      ← Phase 1 output ✅
├── contracts/
│   ├── es-commands.md     ← Phase 1 output ✅
│   └── cmdutil-api.md     ← Phase 1 output ✅
└── tasks.md           ← Phase 2 output (created by /speckit-tasks, NOT this command)
```

### Source Code (repository root)

```text
internal/
└── cmdutil/
    ├── errors.go          NEW — StructuredError, ErrCode* constants, NewStructuredError, WrapError
    ├── errors_test.go     NEW — unit tests (idempotency, serialisation, plain-error wrapping)
    ├── context.go         NEW — ResolveContext
    ├── context_test.go    NEW — unit tests (missing file, no context, context not found, success)
    ├── dryrun.go          NEW — HandleDryRun
    ├── dryrun_test.go     NEW — unit tests (not registered, not active, active+json, active+table)
    ├── render.go          NEW — RenderError
    └── render_test.go     NEW — unit tests (json format, table format, plain error fallback)

cmd/
├── es_resources.go        MODIFIED — runGet P3 to all 4 subcommands
├── api.go                 MODIFIED — newRawCmd P3; --dry-run added
├── esql.go                MODIFIED — RunE P3
└── (no new files)

**Structure Decision**: Single project layout. Utilities are isolated in `internal/cmdutil/`; command files are modified in place. No new top-level packages.

---

## Complexity Tracking

> Partial Principle I and Principle II compliance are pre-existing and deferred by explicit spec assumptions. Entries below satisfy the constitution's Complexity Tracking governance requirement.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I partial | Config-driven command registration is a separate, larger feature | Implementing it here would exceed scope; spec explicitly defers it |
| Principle II partial (`--data` JSON input, `--help --format=json` schema, response templating) | Schema introspection and `--data` input are a larger cross-cutting concern that interlock with Principle I (config-driven commands); implementing them here would exceed scope and create unresolved dependencies | Deferral is acceptable per constitution governance; this feature delivers the error I/O shape (Principle II §error messages) as a complete, independently testable unit |
