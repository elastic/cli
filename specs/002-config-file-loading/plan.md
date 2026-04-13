# Implementation Plan: Configuration File Loading

**Branch**: `002-config-file-loading` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/002-config-file-loading/spec.md`

## Summary

Implement a kubectl-style YAML configuration system for the Elastic CLI. The system uses cosmiconfig (ID: `elastic`) to discover and load config files, validates them with Zod schemas, and resolves a selected context (containing per-service endpoint and auth blocks for elasticsearch, kibana, and cloud) into a typed object passed to command handlers. Supports `--config` and `--context` CLI flag overrides.

## Technical Context

**Language/Version**: TypeScript (type-stripped at runtime via `--experimental-strip-types`), Node.js 22+
**Primary Dependencies**: cosmiconfig 9.x (config discovery/loading with built-in YAML support), Zod 4.x (schema validation), Commander.js 14.x (CLI framework), yaml 2.x (available but cosmiconfig handles YAML natively)
**Storage**: YAML config file on local filesystem
**Testing**: Node.js built-in test runner (`node --test`), `node:assert/strict`
**Target Platform**: Windows, Linux, macOS (cross-platform per Constitution VII)
**Project Type**: CLI
**Performance Goals**: Config discovery + parse + validate + resolve < 100ms
**Constraints**: Minimal dependencies (Constitution VI); no new deps required — cosmiconfig, zod, yaml already in package.json
**Scale/Scope**: Single config file, typically < 1KB, < 10 contexts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ PASS | Config loading itself is infrastructure; commands using it will follow config-driven patterns |
| II. Agent-First I/O | ✅ PASS | Config errors will use structured error format; config loading is internal plumbing, not a user-facing command |
| III. Input Validation & Safety | ✅ PASS | All config input validated via Zod before reaching handlers |
| IV. Context-Based Configuration | ✅ PASS | This feature directly implements Principle IV |
| V. Test-First Development | ✅ PASS | Will follow red/green TDD cycle |
| VI. Minimal Dependencies | ✅ PASS | cosmiconfig, zod, yaml already in package.json; no new deps |
| VII. Cross-Platform Compatibility | ✅ PASS | cosmiconfig uses platform-agnostic path resolution; config paths will use `os.homedir()` and `path.join` |

No violations. No Complexity Tracking entries needed.

**Post-Phase 1 re-check**: All gates still pass. Design uses Zod for validation (Principle III), cosmiconfig for cross-platform discovery (VII), no new deps (VI), and credentials live exclusively in the config file per Principle IV ("Credentials MUST NOT be accepted as bare CLI flags"). Auth is per-service-block, not exposed as CLI flags.

## Project Structure

### Documentation (this feature)

```text
specs/002-config-file-loading/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── config-schema.md # Config file contract
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── cli.ts               # Entry point (existing — add global --config/--context flags)
├── factory.ts           # Command factory (existing — extend to inject resolved config)
└── config/
    ├── schema.ts         # Zod schemas for config file, contexts, service blocks, auth
    ├── loader.ts         # cosmiconfig setup, discovery, load, validate, resolve pipeline
    └── types.ts          # Exported TypeScript types derived from Zod schemas

test/
├── cli.test.ts           # Existing
├── factory.test.ts       # Existing
└── config/
    ├── schema.test.ts    # Schema validation tests
    └── loader.test.ts    # Loader pipeline tests (discovery, validation, resolution)
```

**Structure Decision**: Single-project layout. Config module lives under `src/config/` as a cohesive unit with schema definitions, loader logic, and exported types. Tests mirror source structure under `test/config/`.
