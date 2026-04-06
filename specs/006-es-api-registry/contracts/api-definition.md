# Contract: ES API Command Interface

**Branch**: `006-es-api-registry` | **Date**: 2026-04-02

This document defines the user-facing CLI contract for Elasticsearch API commands registered under `elastic es`.

## Command Structure

```
elastic es <namespace> <command> [options]
```

### Discovery

```bash
# List all namespaces
elastic es --help

# List commands in a namespace
elastic es cat --help
elastic es indices --help

# Show help for a specific command
elastic es cat health --help
elastic es indices create --help
```

### Help Output Contract

`elastic es <namespace> <command> --help` displays:
- Command description (from `EsApiDefinition.description`)
- Options table: one `--flag` per path param, one per query param, one per body field (excluding
  underscore-prefixed fields), plus `--file` when a body schema is present
- Input schema section (full unified schema)

`elastic es <namespace> <command> --help --format=json` returns the command's full JSON Schema for the unified input object.

### Input Model

Every parameter — path params, query params, and body fields — is a top-level `--flag`. There is no `--body` wrapper; body fields are peers of path and query params from the user's perspective.

1. **CLI flags**: Each path param, query param, and body field is a `--flag-name <value>`.
   - Query params with a `cliFlag` override use that name (e.g., `--response-format` instead of `--format`)
   - Underscore-prefixed body fields (e.g., `_meta`) cannot be expressed as CLI flags and must be
     supplied via `--file` or stdin
2. **JSON via file**: `--file <path>` reads a flat JSON object. All param types — path, query, and
   body fields — are top-level keys. Underscore-prefixed body fields can be included here.
3. **JSON via stdin**: Pipe a flat JSON object to stdin. Same key mapping as `--file`.
4. **Mixed**: CLI flags are merged over file/stdin input, with CLI flags taking precedence.

All input is validated against the unified schema before the handler is invoked.

#### Key mapping

| Param type | Schema key (CLI flag / JSON key) | ES destination key |
|---|---|---|
| Path param | `name` | `name` (URL template token) |
| Query param | `cliFlag ?? name` | `name` (querystring key) |
| Body field | `fieldName` (natural Zod shape key) | `fieldName` (body JSON key) |

#### Free-form body APIs

Some APIs accept an arbitrary key-value body (e.g., `indices put-settings` accepts arbitrary index
settings). These APIs have no `body` schema defined. Supply the body via `--file` or stdin as a
JSON object; the content is forwarded directly to Elasticsearch.

### Output Contract

- **Default (`--format text`)**: Response body passed through as-is
  - `responseType: "json"` -> pretty-printed JSON (2-space indent)
  - `responseType: "text"` -> raw text (e.g., `_cat` table output)
- **`--format json`**: Response body as JSON (single-line for machine consumption)

### Error Contract

Errors follow the existing CLI error format:

```json
{
  "error": {
    "code": "input_validation_failed",
    "message": "Input validation failed with 2 issue(s)",
    "issues": [...]
  }
}
```

Error codes specific to ES API commands:
- `input_validation_failed`: Input violates the command's unified schema
- `transport_error`: Network or Elasticsearch error (includes HTTP status code and ES error body)
- `missing_config`: No Elasticsearch connection configured in active context

### Dry Run

`--dry-run` support is not implemented at the ES API layer. It will be added globally at the factory level in a future spec and will apply uniformly to all commands including `elastic es` commands.

## API Definition Contract (for code generation)

Each namespace file exports a `const` array of `EsApiDefinition` objects:

```typescript
// src/es/apis/indices.ts
export const indicesApis: EsApiDefinition[] = [
  {
    name: 'create',
    namespace: 'indices',
    description: 'Creates a new index',
    method: 'PUT',
    path: '/{index}',
    pathParams: [
      { name: 'index', description: 'Name of the index to create', required: true },
    ],
    queryParams: [
      { name: 'wait_for_active_shards', type: 'string', description: 'Number of active shards to wait for' },
    ],
    body: z.object({
      settings: z.record(z.string(), z.unknown()).optional().describe('Index settings'),
      mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings'),
    }),
    responseType: 'json',
  },
]
```

At registration time, `registerEsCommands` synthesizes the following unified schema:
```typescript
z.looseObject({
  index: z.string().describe('Name of the index to create'),           // path param
  wait_for_active_shards: z.string().describe('...').optional(),      // query param
  settings: z.record(z.string(), z.unknown()).optional().describe('...'), // body field
  mappings: z.record(z.string(), z.unknown()).optional().describe('...'), // body field
})
```

This produces CLI flags `--index`, `--wait-for-active-shards`, `--settings`, and `--mappings`.
`buildRequestParams` uses the definition's param arrays to route each key back:
- `index` -> path interpolation
- `wait_for_active_shards` -> querystring
- `settings`, `mappings` -> body object

### Adding a New Namespace

1. Create `src/es/apis/<namespace>.ts` exporting `const <namespace>Apis: EsApiDefinition[]`
2. Add one import + spread line in `src/es/apis/index.ts`

### Adding a New API to an Existing Namespace

1. Add an `EsApiDefinition` object to the namespace's array
2. No other files need changes -- `registerEsCommands` synthesizes the schema automatically
