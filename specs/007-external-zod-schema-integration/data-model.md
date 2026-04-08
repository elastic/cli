# Data Model: External Zod Schema Integration

**Branch**: `007-external-zod-schema-integration` | **Date**: 2026-04-03

## Entities

### EsApiDefinition (simplified)

The core declarative definition for an Elasticsearch API endpoint. Replaces the current interface by removing separate `pathParams`, `queryParams`, and `body` fields in favor of a single unified `input` schema.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Kebab-case command name (e.g., `"create"`, `"put-mapping"`) |
| `namespace` | `string` | Yes | ES namespace (e.g., `"cat"`, `"indices"`) — determines parent group |
| `description` | `string` | Yes | Human-readable description for `--help` text |
| `method` | `HttpMethod` | Yes | HTTP method (`GET`, `POST`, `PUT`, `DELETE`, `HEAD`) |
| `path` | `string` | Yes | URL path template with `{param}` tokens |
| `input` | `z.ZodObject` | No | Unified Zod schema; all fields carry `found_in` metadata |
| `responseType` | `"json" \| "text"` | No | How to handle the response body; defaults to `"json"` |

**Removed fields**: `pathParams`, `queryParams`, `body`

**Validation rules**:
- `name` matches `/^[a-z0-9][a-z0-9-]*$/`
- `namespace` matches `/^[a-z][a-z-]*$/`
- `path` starts with `/`
- Every `{param}` token in `path` has a corresponding schema field with `found_in: "path"`
- Every schema field with `found_in: "path"` has a corresponding `{param}` token in `path` (unless optional)
- No duplicate CLI flag names after kebab-case normalization

---

### SchemaArgDefinition (extended)

Extended to include the `foundIn` field for parameter routing classification.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaKey` | `string` | Yes | Original key name from Zod schema (snake_case) |
| `cliFlag` | `string` | Yes | Kebab-case flag name derived from `schemaKey` |
| `type` | `string` | Yes | Declared type: `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"`, `"enum"` |
| `required` | `boolean` | Yes | Whether the field is required |
| `defaultValue` | `unknown` | No | Default value from schema |
| `description` | `string` | Yes | Description from schema metadata |
| `foundIn` | `"path" \| "query" \| "body"` | No | Parameter routing location; defaults to `"body"` when absent |

**New field**: `foundIn` — extracted from Zod `.meta({found_in: ...})` at registration time

---

### FoundInMetadata

The metadata type attached to each Zod field via `.meta(...)`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `found_in` | `"path" \| "query" \| "body"` | Yes | Declares where the parameter is sent in the HTTP request |

**Usage**: `z.string().describe("Target index").optional().meta({ found_in: "path" })`

## Relationships

```text
EsApiDefinition
  ├── has one input: z.ZodObject (unified schema)
  │     └── each field has FoundInMetadata via .meta()
  └── produces SchemaArgDefinition[] at registration time
        └── each SchemaArgDefinition has foundIn from FoundInMetadata

SchemaArgDefinition[] is used by:
  ├── factory.ts → register CLI flags and help text
  └── request-builder.ts → route params to path/query/body
```

## State Transitions

N/A — entities are immutable after registration. `EsApiDefinition` is a static configuration; `SchemaArgDefinition[]` is derived once at command registration time and does not change.
