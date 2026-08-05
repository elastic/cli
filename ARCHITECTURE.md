# Architecture Decisions

Read this before proposing structural changes. Each section documents a deliberate choice made for startup performance or memory efficiency, validated by `scripts/perf-check` (startup latency) and `scripts/heap-check` (heap allocation). Do not refactor these unless benchmarks prove the change is neutral.

## Factory Core Split (`factory-core.ts` / `factory.ts`)

`factory-core.ts` contains types and lightweight functions needed to build command groups and render `--help`. It deliberately avoids importing `json-schema-args.ts`, output formatters, and the config store.

`factory.ts` re-exports everything from `factory-core.ts` and adds the heavy command-definition logic.

**Why**: Callers that only need group structure (e.g. lazy namespace registration) import `factory-core.ts` and skip the transitive cost of schema-arg extraction and friends. Merging the two files would regress `--help` latency for every namespace.

**Consumers**: `cli.ts`, `cloud/register-lazy.ts`, `namespaces.ts`, `es/register.ts` all import from `factory-core.ts` directly.

## Lazy API Definition Loading (`src/es/apis.ts`, `src/kb/apis.ts`)

API input schemas are no longer generated into this repo. They ship as JSON Schema in the published `@elastic/schemas` package, one file per endpoint namespace under `@elastic/schemas/es/tools/apis/*.js` (Kibana: `@elastic/schemas/kibana/tools/apis/*.js`). `src/es/api-manifest.ts` / `src/kb/api-manifest.ts` re-export the static per-endpoint metadata (name, HTTP method, path) from `@elastic/schemas`' own manifest.

**Why**: Loading every endpoint's schema at once allocates several gigabytes of heap (see `elastic/cli#171`). `loadEsApi()` / `loadEsApisInFile()` (and their `kb` equivalents) dynamic-`import()` only the namespace file for the endpoint actually invoked, memoized in a per-file module cache so repeated lookups in the same file are free. `src/lib/json-schema-refs.ts` then inlines each definition's sidecar `$ref`s (e.g. `_types.json`, shared by hundreds of definitions) into a self-contained schema, with sidecar files themselves loaded and expanded once and shared across every definition that references them.

**Do not**: Eagerly load every namespace file at startup, or bypass `createSidecarResolver`'s per-file memoization when resolving `$ref`s — either regresses the heap/latency numbers this design fixed. There is currently no local regeneration path for these schemas; they come from whatever `@elastic/schemas` version is installed.

## Schema Composition and `x-` Metadata

As of `@elastic/schemas` 0.5.1, every request document in all four namespaces is a plain `{ type: 'object', properties, required }` object. Composition survives only *inside* properties (`$ref`, `anyOf`, `oneOf`), which `src/lib/json-schema-refs.ts` inlines from the sidecar `_defs.json` / `_types.json` files. `flattenComposition()` in `src/kb/apis.ts` and `resolveRootRef()` in `src/lib/json-schema-refs.ts` handle root-level `allOf` / `oneOf` / `$ref`; no current definition reaches either, and both are kept so an upstream regression degrades into correct behaviour rather than silently-missing CLI flags. `resolveRootRef()` throws instead of returning an empty schema when a root `$ref` does not resolve to an object with properties.

Properties and roots carry `x-` annotations. Two classes, and the distinction matters:

| Key | Level | Class | Consumer |
|---|---|---|---|
| `x-found-in` | property | routing | request builders |
| `x-body-root` | property | routing | body promotion in the ES, Kibana, and Cloud request builders |
| `x-api`, `x-method`, `x-path`, `x-urls`, `x-body-format` | root | routing | duplicates of the definition's own fields |
| `x-availability`, `x-deprecated` | root + property | user-facing | not yet surfaced |
| `x-destructive`, `x-response-type` | root | user-facing | duplicates of the definition's own fields |

**Do not**: strip `x-` keys by prefix. `stripTransportMeta()` in `src/factory-core.ts` removes the routing class by explicit name so user-facing annotations survive into `--help --json`. Routing metadata leaking into schema output violates the transport-abstraction requirement in AGENTS.md.

## `cli-schema.ts` — CLI Structure Emitter

Module that introspects the registered Commander tree and each command's attached JSON Schema `input` to build the `elastic cli-schema` output consumed by agents.

**Why**: Project requirement — every command must emit its full JSON Schema so agents can introspect valid inputs. It reads `properties`/`required`/`enum`/`anyOf` directly off the already-resolved `input` schema (see `src/lib/json-schema-refs.ts`); it does not run a schema validator over anything itself.

## Lazy Loading in `es/register.ts`

`defineCommand`, the request handler, and the per-endpoint API definitions are all loaded lazily via dynamic `import()`. The top-level import graph for `elastic es --help` touches only Commander and the manifest.

**Why**: `elastic es --help` must render in ~59 ms. Eagerly importing the handler module or any endpoint's schema adds measurable latency.

## AJV Validation (`src/lib/ajv-validate.ts`)

Input validation runs the command's JSON Schema `input` through `ajv@6` (`getAjv()`, lazily `require()`d on first use), with `allErrors: true` and `useDefaults: true`. `validateSchema: false` is set because `@elastic/schemas` output contains cosmetic meta-schema violations (e.g. nullable enums with a repeated `null`) that ajv would otherwise reject before validating any input.

**Why ajv@6, not a newer draft**: the schemas declare `$schema` (stripped before compiling) but rely on draft-07-era `dataPath`/`unknownFormats` semantics this codebase already accounts for. See the `ponytail:` comment in `ajv-validate.ts` before upgrading — `strict`, `validateSchema`, and `unknownFormats` all mean something different (or don't exist) under ajv@8/draft2020-12.

## Dependencies

| Dependency | Used by | Why it stays |
|---|---|---|
| `cli-table3` | `src/output.ts` | Table rendering for human-readable output. `console.table` lacks formatting control. |
| `csv-parse` | `src/es/helpers/shared.ts` | Full RFC 4180 CSV parsing for bulk ingest. A naive `split()` breaks on quoted fields, escapes, and multi-line values. |
| `marked` + `marked-terminal` | `src/docs/renderer.ts` (4 consumers) | Terminal markdown rendering for `elastic docs` commands. |
| `@elastic/config-resolver` | Config subsystem | Internal Elastic package. |
| `@elastic/schemas` | `src/es/apis.ts`, `src/kb/apis.ts`, `src/es/api-manifest.ts`, `src/kb/api-manifest.ts` | Published source of API manifests and per-endpoint JSON Schema definitions. Replaces the removed Zod-based codegen pipeline (see git history). The CLI tracks the latest stable release; the caret range in `package.json` is the source of truth for the supported version. There is no local regeneration path. |
| `ajv` (^6.14.0) | `src/lib/ajv-validate.ts` | Validates command input against the JSON Schema `@elastic/schemas` provides. Pinned to v6 for draft-07 semantics this codebase's error handling depends on; see the `ponytail:` comment in `ajv-validate.ts` before upgrading. |

## `cli-schema-intent.ts`

30-line helper that infers `CommandIntent` from HTTP methods. Used by `es/register.ts` and `kb/register.ts`. Small enough to inline, but kept as a separate module for clarity. No performance implications either way.
