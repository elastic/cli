# Implementation Plan: JSON Input Schema Validation

**Branch**: `004-json-input-validation` | **Date**: 2026-04-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature spec from `/specs/004-json-input-validation/spec.md`

## Summary

Add Zod schema support to `CommandConfig.input` so that commands can declare a validation schema for JSON input. When a schema is provided and JSON data is supplied (via `--file` or stdin), the factory validates the data against the schema using `safeParse()` before invoking the handler. Valid data is passed as a strongly-typed parsed result via `z.infer<T>`; invalid data triggers an immediate error with all field-level issues formatted via `z.prettifyError()` (text mode) or as structured JSON matching the constitution's error format (JSON mode). The existing `input: true` boolean remains supported for backward compatibility.

## Technical Context

**Language/Version**: TypeScript 6.x on Node.js with `--experimental-strip-types`
**Primary Dependencies**: Commander.js ^14.0.3, Zod ^4.3.6
**Storage**: N/A (CLI tool, no persistence for this feature)
**Testing**: Node.js built-in test runner (`node:test`) with `node:assert`
**Target Platform**: Windows, Linux, macOS (cross-platform per Constitution VII)
**Project Type**: CLI
**Performance Goals**: Validation completes in <1s for any reasonable input size
**Constraints**: No new dependencies; Zod v4 already available
**Scale/Scope**: Primary changes in `src/factory.ts` + `test/factory.test.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ PASS | Schema declared in `CommandConfig.input` — validation is config-driven |
| II. Agent-First I/O | ✅ PASS | JSON input validated via schema; `--format=json` error output per FR-010 |
| III. Input Validation & Safety | ✅ PASS | This feature *implements* Principle III for JSON input |
| IV. Context-Based Configuration | ✅ N/A | No changes to config/context system |
| V. Test-First Development | ✅ PASS | TDD cycle mandated |
| VI. Minimal Dependencies | ✅ PASS | No new dependencies — uses existing Zod v4 |
| VII. Cross-Platform | ✅ PASS | No platform-specific code; Zod and JSON parsing are platform-agnostic |

### Post-Design Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ PASS | Schema is part of `CommandConfig` — no imperative validation in command handlers |
| II. Agent-First I/O | ✅ PASS | Error output follows constitution format: `{"error": {"code": "…", "message": "…"}}` with `issues` array for field-level detail |
| III. Input Validation & Safety | ✅ PASS | `safeParse()` validates before handler; all issues reported; `prettifyError` for text, structured JSON for `--format=json` |
| IV. Context-Based Configuration | ✅ N/A | Unchanged |
| V. Test-First Development | ✅ PASS | All changes require tests first |
| VI. Minimal Dependencies | ✅ PASS | Zero new dependencies |
| VII. Cross-Platform | ✅ PASS | All APIs used (`z.safeParse`, `z.prettifyError`, `instanceof`) are platform-agnostic |

No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-json-input-validation/
├── plan.md                        # This file
├── research.md                    # Phase 0 output — Zod API research
├── data-model.md                  # Phase 1 output — entity changes
├── quickstart.md                  # Phase 1 output — usage guide
├── contracts/
│   └── command-config.md          # Phase 1 output — interface contract
└── tasks.md                       # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
src/
├── cli.ts           # Main CLI entry point (unchanged)
└── factory.ts       # Command factory — primary change target

test/
├── cli.test.ts      # CLI integration tests (unchanged)
└── factory.test.ts  # Factory unit tests — test additions here
```

**Structure Decision**: This feature is a focused enhancement to the existing `factory.ts` module. No new source files needed. Changes are contained within the command definition pipeline (`defineCommand`) and the action callback where JSON input is parsed and passed to the handler.

## Design Decisions

### D1: Runtime schema detection
Use `instanceof z.ZodType` in `defineCommand` to distinguish `input: <schema>` from `input: true`. This runs at definition time, catching invalid configurations early.

### D2: Validation via `safeParse`
Use `schema.safeParse(data)` which returns a discriminated union without throwing. On success, `.data` carries the fully-typed output. On failure, `.error` provides all issues at once.

### D3: Error formatting
- **Text mode**: `z.prettifyError(error)` → multi-line string with `✖` markers and `→ at path` annotations
- **JSON mode**: Constitution-compliant `{"error": {"code": "input_validation_failed", "message": "...", "issues": [...]}}` using raw `error.issues`

### D4: Type safety via generics
`CommandConfig<T>` becomes generic over the schema type. `ParsedResult` gains a type parameter for `input`. When `input` is a `ZodType`, the handler receives `ParsedResult<z.infer<T>>`. When `input: true`, it falls back to `unknown`.

### D5: Backward compatibility
`input: true` continues to work exactly as before — raw `JSON.parse` result, no validation, `unknown` type. The `--file` reservation check applies equally to both `true` and schema values.

## Key Implementation Notes

- The `parseJsonContent` function continues to handle JSON syntax parsing. Schema validation is a new step that runs *after* JSON parsing succeeds but *before* the handler is called.
- `--format=json` detection: the plan assumes a global format flag will be available (or will be introduced). The validation error handler checks this flag to decide output format.
- The `input` property type union is: `boolean | z.ZodType | undefined`. At runtime, the check order is: `instanceof z.ZodType` → `=== true` → default (no input).
