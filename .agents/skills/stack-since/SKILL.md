---
name: stack-since
description: Maintain codegen/functional/stack-since.json, the per-API "introduced in" versions that gate ES and Kibana functional tests by STACK_VERSION. Use when adding a stack version to the Buildkite matrix, bumping @elastic/schemas, or when a functional test fails on an older stack because it calls an API that version lacks.
---

# stack-since

`codegen/functional/stack-since.json` maps API action names to the first stack
version that has them:

```json
{ "es": { "esql.get_query": "9.1.0" }, "kb": { "agent-builder.post_agent_builder_agents": "9.2.0" } }
```

ES and KB functional codegen skip a definition when `STACK_VERSION` is older
than the newest `since` of any API its `do` steps call (or its own
`requires.stack_since`). See `stackSinceFor` in `codegen/functional/parser.ts`.

## Update

Run from the repo root. The script fetches both sources from GitHub `main`, so
no local clone is needed:

```bash
npx tsx .agents/skills/stack-since/scripts/update-stack-since.ts
```

To pin a release branch, or use a local checkout, pass a URL or path for each
source (ES first, Kibana second):

```bash
npx tsx .agents/skills/stack-since/scripts/update-stack-since.ts \
  https://raw.githubusercontent.com/elastic/elasticsearch-specification/9.5/output/schema/schema.json \
  https://raw.githubusercontent.com/elastic/kibana/9.5/oas_docs/output/kibana.yaml
```

Then verify:

1. `jj diff codegen/functional/stack-since.json`: check that the new entries are plausible.
2. Regenerate against the oldest matrix version and read the skips:
   `ELASTIC_ENVIRONMENT=stack STACK_VERSION=9.0.8 npx tsx codegen/functional/kb.ts | rg 'stack_since'`
   `STACK_VERSION=9.0.8 npx tsx codegen/functional/es.ts --tests-dir <clients-tests>/tests | rg 'stack_since'`
3. `npm run test:unit`.

## Sources

| Map | Source | Field |
|-----|--------|-------|
| `es` | `elastic/elasticsearch-specification` `output/schema/schema.json` | `endpoints[].availability.stack.since`, keyed by `endpoints[].name` (same as the `do` action) |
| `kb` | `elastic/kibana` `oas_docs/output/kibana.yaml` | operation-level `x-state` text matching `added in X.Y.Z`, keyed by the CLI command for that method + path |

Rules:

- Only versions >= 9.0.0 are kept. The oldest tested stack is 9.0, so older APIs never need a gate.
- Only API-level data counts. Property-level `since` values (ES) and `x-state` on schemas (Kibana) are ignored.
- Kibana keys use the CLI namespace plus the command name with `-` replaced by `_`, because definitions write actions that way (`agent-builder.post_agent_builder_agents`).
- Kibana operations with no matching CLI command are listed and skipped. They appear after a `@elastic/schemas` bump adds them; rerun the script then.
- Kibana `x-state` without a version (e.g. `Technical Preview`) gives no data. If such an API fails on old stacks, add a `requires.stack_since` to its definition in `test/functional/kb/definitions/` rather than hand-editing the JSON, so the script stays the single writer of the file.

## Pinning the source ref

`main` can list APIs that are newer than every version in the matrix. That is
harmless: those APIs gate only definitions that cannot pass on the matrix
anyway. To match a specific release exactly, pass that release branch's URLs as
shown above.
