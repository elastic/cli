# Implementation Plan: Schema-Driven Input Validation

**Branch**: `005-zod-schema-input` | **Date**: 2026-04-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature spec from `/specs/005-zod-schema-input/spec.md`

## Summary

Extend the command factory so that every command with an `input` Zod schema automatically derives CLI arguments from its top-level keys. CLI arguments are kebab-cased from the schema's snake_case/camelCase keys, coerced to the declared type, and merged with JSON input (CLI wins). Unknown keys are rejected. Defaults are applied. Help text is auto-generated from schema metadata.

## Technical Context

**Language/Version**: TypeScript (ESNext, strict), Node.js 22+ with native type stripping
**Primary Dependencies**: Commander.js (^14), Zod v4 (^4.3), cosmiconfig (^9)
**Storage**: N/A (CLI tool, no persistence beyond config files)
**Testing**: Node.js built-in test runner (`node:test`), `assert/strict`
**Target Platform**: Windows, Linux, macOS (Constitution Principle VII)
**Project Type**: CLI
**Performance Goals**: Input parsing and validation must complete in <100ms for schemas with up to 50 fields
**Constraints**: Minimal dependencies (Constitution Principle VI); no new third-party packages
**Scale/Scope**: ~6 source files touched, ~1 new utility module, ~200–400 lines of new code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ Pass | Schema-driven arguments extend the config-driven pattern. Input shape already defined by Zod schema in `CommandConfig.input`. |
| II. Agent-First I/O (NON-NEGOTIABLE) | ✅ Pass | Feature directly implements: JSON via stdin/`--file`, all schema fields as CLI flags, `--help` introspection. Aligns with `--help --format=json` returning the schema. |
| III. Input Validation & Safety (NON-NEGOTIABLE) | ✅ Pass | All input validated against schema before action. Unknown keys rejected. `--dry-run` support is orthogonal and already handled. Constitution requires `description` on every input field — this feature surfaces those descriptions in `--help`. |
| IV. Context-Based Configuration | ✅ Pass | No change to context/config system. Schema-derived flags are command-specific, not credentials. |
| V. Test-First Development (NON-NEGOTIABLE) | ✅ Pass | TDD cycle will be followed. Existing test patterns in `test/factory.test.ts` provide the template. |
| VI. Minimal Dependencies | ✅ Pass | No new dependencies. Uses Zod (already present) for introspection and Commander (already present) for flag registration. |
| VII. Cross-Platform Compatibility (NON-NEGOTIABLE) | ✅ Pass | No platform-specific code. Kebab-case conversion and JSON parsing are string-only operations. Stdin/file reading already cross-platform tested. |

All gates pass. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-zod-schema-input/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── schema-to-cli.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── factory.ts           # Modified: schema introspection, arg registration, merge logic
├── cli.ts               # Minor updates if needed for new global flags
├── lib/
│   └── schema-args.ts   # New: Zod schema → CLI argument extraction & coercion utilities
└── config/              # Unchanged

test/
├── factory.test.ts      # Extended: schema-driven argument tests
└── lib/
    └── schema-args.test.ts  # New: unit tests for schema introspection utilities
```

**Structure Decision**: Single project, no new top-level directories. The new `src/lib/schema-args.ts` module isolates schema introspection logic from the factory, keeping `factory.ts` focused on Commander wiring. Tests follow the existing `test/` mirror structure.

## Post-Design Constitution Re-Check

| Principle | Status | Design Impact |
|-----------|--------|---------------|
| I. Config-Driven Commands | ✅ Pass | Schema-derived args are a natural extension of config-driven commands. No bespoke imperative code for individual commands. |
| II. Agent-First I/O (NON-NEGOTIABLE) | ✅ Pass | Design ensures `--help --format=json` can return the full JSON Schema (via `z.toJSONSchema()`). All schema fields addressable as CLI flags. |
| III. Input Validation & Safety (NON-NEGOTIABLE) | ✅ Pass | Strict unknown key rejection enforced. Validation runs before handler. Constitution requires `description` on every input field — enforced by the schema-to-help contract. |
| IV. Context-Based Configuration | ✅ Pass | No changes to config/context system. |
| V. Test-First Development (NON-NEGOTIABLE) | ✅ Pass | Test structure defined: `test/lib/schema-args.test.ts` (unit) + extended `test/factory.test.ts` (integration). |
| VI. Minimal Dependencies | ✅ Pass | Zero new dependencies. All functionality built on Zod v4 + Commander.js already in `package.json`. |
| VII. Cross-Platform Compatibility (NON-NEGOTIABLE) | ✅ Pass | All new code is string manipulation and JSON parsing. No file system, shell, or platform-specific operations. |

All gates pass post-design. No complexity tracking entries needed.
