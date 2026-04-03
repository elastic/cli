# Implementation Plan: Elasticsearch API Registry

**Branch**: `006-es-api-registry` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/006-es-api-registry/spec.md`

## Summary

Define a scalable, code-generation-friendly structure for registering Elasticsearch API commands under `elastic es`. Uses per-namespace static registry files (one per ES namespace such as `cat`, `indices`) with a barrel import. Each API is a declarative definition object specifying HTTP method, path template, parameters, and optional body schema. A generic handler reads the definition, builds the HTTP request via `@elastic/transport`, and displays the response. The proof-of-concept implements all `_cat` and `indices` namespace APIs.

## Technical Context

**Language/Version**: TypeScript on Node.js (native via `--experimental-strip-types`)
**Primary Dependencies**: Commander.js (CLI framework), Zod v4 (validation), `@elastic/transport` (new — HTTP transport to Elasticsearch), cosmiconfig (config), YAML (config serialization)
**Storage**: N/A (CLI tool, no persistent storage)
**Testing**: Node.js built-in test runner (`node:test`), TDD discipline per constitution
**Target Platform**: Windows, Linux, macOS (cross-platform per Constitution VII)
**Project Type**: CLI
**Performance Goals**: CLI startup must remain sub-second even with hundreds of registered APIs
**Constraints**: Minimal dependencies (Constitution VI — `@elastic/transport` approved in spec). All definitions are static imports; no dynamic `import()` or filesystem scanning.
**Scale/Scope**: ~25 `_cat` APIs + ~37 `indices` APIs for PoC; architecture must support 400+ APIs total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ Pass | API definitions are declarative config objects; the generic handler derives behavior from config |
| II. Agent-First I/O (NON-NEG) | ✅ Pass | Commands accept JSON via stdin/`--file`, emit JSON via `--format=json`, expose JSON Schema via `--help --format=json`. Schema `description` fields drive help text |
| III. Input Validation & Safety (NON-NEG) | ✅ Pass | Zod schemas validate input before any network call; `--dry-run` support via resolved request payload display |
| IV. Context-Based Configuration | ✅ Pass | Reuses existing config/context system; `@elastic/transport` client instantiated from resolved context's `elasticsearch` service block |
| V. Test-First Development (NON-NEG) | ✅ Pass | Plan follows TDD; all tasks specify test-first approach |
| VI. Minimal Dependencies | ✅ Pass | Only `@elastic/transport` added (approved in spec clarification); no other new deps |
| VII. Cross-Platform (NON-NEG) | ✅ Pass | No filesystem scanning, no shell-specific code, path-agnostic; static imports only |

## Project Structure

### Documentation (this feature)

```text
specs/006-es-api-registry/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── contracts/
│   └── api-definition.md  # API definition contract
└── tasks.md               # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── cli.ts                          # Updated: registers `es` group
├── factory.ts                      # Existing: defineCommand, defineGroup
├── config/                         # Existing: config loading
├── lib/
│   ├── schema-args.ts              # Existing: schema arg extraction
│   └── transport.ts                # New: @elastic/transport client factory
└── es/
    ├── register.ts                 # New: reads namespace registries, builds Commander tree
    ├── types.ts                    # New: EsApiDefinition interface
    ├── handler.ts                  # New: generic handler (definition + input → transport request → output)
    ├── request-builder.ts          # New: builds TransportRequestParams from definition + parsed input
    └── apis/
        ├── index.ts                # New: barrel — re-exports all namespace arrays
        ├── cat.ts                  # New: all _cat API definitions
        └── indices.ts              # New: all indices API definitions

test/
├── es/
│   ├── register.test.ts
│   ├── handler.test.ts
│   ├── request-builder.test.ts
│   └── types.test.ts
└── lib/
    └── transport.test.ts
```

**Structure Decision**: Single-project layout. New `src/es/` directory contains all Elasticsearch API registry code. `src/es/apis/` holds per-namespace definition files. This parallels the existing `src/config/` and `src/lib/` organization.

## Complexity Tracking

No constitution violations requiring justification.
