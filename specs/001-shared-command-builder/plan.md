# Implementation Plan: Shared Command Builder

**Branch**: `001-shared-command-builder` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/001-shared-command-builder/spec.md`

## Summary

Build a command factory (`src/factory.ts`) that provides `defineCommand` and `defineGroup` functions to declaratively define CLI subcommands. The factory wraps Commander.js internally, uses Zod for type coercion/validation, and manages the full command lifecycle (parse → validate → execute). Command authors interact only with the factory's config-driven API, never with Commander directly. This establishes the foundation for future cross-cutting concerns (output formatting, auth, JSON Schema generation) aligned with the project constitution.

## Technical Context

**Language/Version**: TypeScript (type-stripped via `--experimental-strip-types`), targeting Node.js 20+
**Primary Dependencies**: Commander.js v14 (CLI parsing), Zod v4 (type coercion/validation)
**Storage**: N/A
**Testing**: Node.js built-in test runner (`node:test`), run via `npm run test:unit`
**Target Platform**: Cross-platform (Windows, Linux, macOS) — CI matrix covers all three
**Project Type**: CLI tool
**Performance Goals**: N/A for this feature (CLI startup latency is not a concern at this scale)
**Constraints**: No new dependencies (Constitution Principle VI). Must work on Node 20, 22, 24, 25 and Bun.
**Scale/Scope**: Internal utility used by all future command definitions; ~1 source file + tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ PASS | Factory accepts a declarative config object. Command metadata and options all declared in config. Help text derived from descriptions. |
| II. Agent-First I/O | ⏩ DEFERRED | Not in scope for this iteration. Factory design supports future addition of `--format=json`, JSON Schema help, stdin input without changing command definitions. |
| III. Input Validation & Safety | ✅ PASS | Zod validates and coerces all inputs before handler invocation. Structured errors on failure. `--dry-run` deferred but addable without breaking changes. |
| IV. Context-Based Configuration | ⏩ DEFERRED | Not in scope. Factory's extensible design supports adding context resolution in future. |
| V. Test-First Development | ✅ PASS | All implementation follows red/green TDD cycle. |
| VI. Minimal Dependencies | ✅ PASS | No new dependencies. Uses existing Commander.js and Zod. |
| VII. Cross-Platform Compatibility | ✅ PASS | No file paths, no shell-specific behavior. Pure argument parsing logic. CI runs on all 3 platforms. |

**Post-Phase 1 re-check**: All gates still pass. The data model and contracts use platform-agnostic patterns. No file system or OS-specific logic involved.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-command-builder/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── factory-api.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── cli.ts               # Existing entrypoint — will import and register commands built with factory
└── factory.ts            # NEW: defineCommand, defineGroup exports (per user direction)

test/
├── cli.test.ts           # Existing (placeholder)
└── factory.test.ts       # NEW: Unit tests for defineCommand, defineGroup
```

**Structure Decision**: Single-file module at `src/factory.ts` as specified by the user. The factory is small enough to be a single module. If it grows significantly in future iterations (JSON Schema generation, output formatting, etc.), internal helpers can be extracted to `src/factory/` without changing the public import path.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle II (Agent-First I/O) deferred | The factory is infrastructure for defining commands; no user-facing commands ship in this iteration. The factory’s config-driven design explicitly supports future addition of `--format=json`, JSON Schema help, and stdin input without breaking existing command definitions. | Implementing Agent-First I/O now would require shipping at least one command to validate it, expanding scope beyond the spec’s stated goal of argument parsing only. |
| Principle III (`--dry-run`) deferred | Same as above — `--dry-run` applies to commands that perform mutations or network calls. No such commands are defined in this iteration. The factory’s extensible handler lifecycle (parse → validate → execute) supports inserting a dry-run check before execution in a future iteration. | Adding `--dry-run` without a real command to test it against would produce untestable, speculative code. |
