# Implementation Plan: JSON Output Format Flag

**Branch**: `003-json-output-format` | **Date**: 2026-03-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/003-json-output-format/spec.md`

## Summary

Add a global `--format` persistent flag to the root command so every subcommand can emit a consistent JSON envelope (`{"data": …, "error": …, "warnings": […]}`) to stdout. The flag is handled entirely in the shared `factory.New` path — individual RunFunc handlers return structured data and the factory serializes it. Errors also serialize to the envelope on stdout with machine-readable codes. No new dependencies are introduced; implementation uses only `encoding/json` from the standard library.

## Technical Context

**Language/Version**: Go 1.25.3
**Primary Dependencies**: Cobra v1.10.2 (CLI framework), pflag v1.0.9, yaml.v3 (config)
**Storage**: N/A — CLI tool, no persistent storage
**Testing**: `go test` with table-driven subtests, existing `*test/` helper packages
**Target Platform**: Cross-platform CLI (Linux, macOS, Windows)
**Project Type**: CLI tool
**Performance Goals**: N/A for this feature — output formatting adds negligible overhead
**Constraints**: No new third-party dependencies (Constitution §VI). stdlib `encoding/json` only.
**Scale/Scope**: Currently 1 subcommand (`version`); design must scale to dozens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Config-Driven Commands | ✅ PASS | `--format` is a globally inherited persistent flag, consistent with config-driven approach. No per-command opt-in required. |
| II | Agent-First I/O (NON-NEG.) | ✅ PASS | This feature **directly implements** the constitution's mandate: "Every command MUST emit machine-readable JSON when `--format=json` is provided." Envelope structure matches required `{"error": {"code": "…", "message": "…"}}`. |
| III | Input Validation & Safety (NON-NEG.) | ✅ PASS | Unsupported `--format` values are rejected with structured error (FR-005). JSON errors on stdout with code+message (FR-003). |
| IV | Context-Based Configuration | ✅ N/A | No change to context/config system. `--format` is orthogonal to `--context`. |
| V | Test-First Development (NON-NEG.) | ✅ PASS | TDD cycle will be followed: tests written before implementation at each step. |
| VI | Minimal Dependencies | ✅ PASS | Uses only stdlib `encoding/json`. Zero new modules. |
| — | Error messages (Dev Standards) | ✅ PASS | Errors serialize as `{"error": {"code": "…", "message": "…"}}` per constitution's Development Standards. |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/003-json-output-format/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── json-envelope.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cmd/
├── root.go              # Add --format persistent flag registration
├── root_test.go         # Tests for --format flag on root + Execute() JSON error path
└── cmdtest/
    └── helpers.go       # Existing helpers (no changes expected)

internal/
├── factory/
│   ├── factory.go       # Extend RunContext, modify New() to serialize output
│   ├── factory_test.go  # Tests for JSON envelope, error serialization, format validation
│   └── factorytest/
│       └── helpers.go   # Existing helpers (no changes expected)
└── output/
    ├── output.go        # New: Envelope type, Render function, format constants
    └── output_test.go   # New: Unit tests for envelope marshaling, edge cases
```

**Structure Decision**: New `internal/output` package isolates envelope types and
rendering from the factory wiring. The factory calls `output.Render()` after the
handler returns, keeping RunFunc signatures focused on business logic. This follows
Go's preference for small, focused packages.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                   |
