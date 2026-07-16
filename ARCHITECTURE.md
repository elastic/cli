# Architecture Decisions

Read this before proposing structural changes. Each section documents a deliberate choice made for startup performance or memory efficiency, validated by `scripts/perf-check` (startup latency) and `scripts/heap-check` (heap allocation). Do not refactor these unless benchmarks prove the change is neutral.

## Factory Core Split (`factory-core.ts` / `factory.ts`)

`factory-core.ts` contains types and lightweight functions needed to build command groups and render `--help`. It deliberately avoids importing Zod, schema-args, output formatters, and the config store.

`factory.ts` re-exports everything from `factory-core.ts` and adds the heavy command-definition logic.

**Why**: Callers that only need group structure (e.g. lazy namespace registration) import `factory-core.ts` and skip the transitive cost of Zod and friends. Merging the two files would regress `--help` latency for every namespace.

**Consumers**: `cli.ts`, `cloud/register-lazy.ts`, `namespaces.ts`, `es/register.ts` all import from `factory-core.ts` directly.

## Per-Endpoint API Files (`src/es/apis/*.ts`)

560 generated files, one per Elasticsearch endpoint. Each file exports a single `EsApiDefinition` array with its Zod input schema.

**Why**: Loading all 560 schemas at once allocates several gigabytes of heap (see `elastic/cli#171`). The lazy barrel in `src/es/apis.ts` loads only the namespace file for the endpoint actually invoked, via `loadEsApi()` / `loadEsApisInFile()` with a per-file module cache.

**Do not**: Collapse into a single file, eagerly import, or remove the per-file isolation.

## API Manifests as TypeScript (`src/es/api-manifest.ts`, `src/kb/api-manifest.ts`)

~6,400 lines of static metadata (names, HTTP methods, paths, descriptions) compiled as TypeScript rather than loaded from JSON at runtime.

**Why**: V8 compiles TS/JS source into bytecode that is cached across runs. `JSON.parse(readFileSync(...))` on a 6K-line file is measurably slower at startup than importing a pre-compiled module, and it cannot benefit from V8's code cache.

## `cli-schema.ts` — JSON Schema Emitter

594-line module that derives JSON Schema from command configs for `--help --json` output.

**Why**: Project requirement — every command must emit its full JSON Schema so agents can introspect valid inputs. Not redundant with Zod; it is the Zod-to-JSON-Schema bridge.

## Lazy Loading in `es/register.ts`

`defineCommand`, `handler`, `types`, and Zod are all loaded lazily via `createRequire` and dynamic `import()`. The top-level import graph for `elastic es --help` touches only Commander and the manifest.

**Why**: `elastic es --help` must render in ~59 ms. Eagerly importing Zod or the handler module adds measurable latency.

## Dependencies

| Dependency | Used by | Why it stays |
|---|---|---|
| `cli-table3` | `src/output.ts` | Table rendering for human-readable output. `console.table` lacks formatting control. |
| `csv-parse` | `src/es/helpers/shared.ts` | Full RFC 4180 CSV parsing for bulk ingest. A naive `split()` breaks on quoted fields, escapes, and multi-line values. |
| `marked` + `marked-terminal` | `src/docs/renderer.ts` (4 consumers) | Terminal markdown rendering for `elastic docs` commands. |
| `@elastic/config-resolver` | Config subsystem | Internal Elastic package. |
| `@elastic/es-schemas` | Codegen source for API definitions | Internal Elastic package. |

## `cli-schema-intent.ts`

30-line helper that infers `CommandIntent` from HTTP methods. Used by `es/register.ts` and `kb/register.ts`. Small enough to inline, but kept as a separate module for clarity. No performance implications either way.
