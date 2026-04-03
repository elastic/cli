# Data Model: Elasticsearch API Registry

**Branch**: `006-es-api-registry` | **Date**: 2026-04-02

## Entities

### EsApiDefinition

The core entity. A declarative, serializable description of a single Elasticsearch API endpoint.

| field | type | required | description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Kebab-case command name (e.g., `"health"`, `"create"`, `"put-mapping"`) |
| `namespace` | `string` | yes | ES namespace (e.g., `"cat"`, `"indices"`). Determines the parent group in the command tree |
| `description` | `string` | yes | Human-readable description for `--help` text |
| `method` | `HttpMethod` | yes | HTTP method: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"HEAD"` |
| `path` | `string` | yes | URL path template. Path parameters use `{param}` syntax (e.g., `"/_cat/health"`, `"/{index}"`) |
| `pathParams` | `EsPathParam[]` | no | Path parameter definitions. Defaults to `[]` |
| `queryParams` | `EsQueryParam[]` | no | Query parameter definitions. Defaults to `[]` |
| `body` | `z.ZodObject` | no | Zod object schema for request body. Each top-level field becomes a `--flag`. Absent for bodyless APIs and for APIs whose body is free-form (provide those via `--file` or stdin) |
| `responseType` | `"json" \| "text"` | no | How to handle the response. Defaults to `"json"` |

**Validation rules**:
- `name` must match `/^[a-z0-9][a-z0-9-]*$/` (same as existing `defineCommand` validation)
- `namespace` must match `/^[a-z][a-z-]*$/`
- `path` must start with `/`
- All `{param}` tokens in `path` must have a corresponding entry in `pathParams`
- Each `pathParams` entry marked `required: true` must have a corresponding `{param}` in `path`
- No schema key collisions across path params, query params, and body fields
  (use `cliFlag` on query params or restructure the definition to avoid conflicts)

**Extensibility**: The interface is designed to accommodate future fields (e.g., `aliases: string[]`, `deprecated: boolean`, `since: string`) without breaking existing definitions.

### EsPathParam

Describes a path parameter that gets interpolated into the URL template.

| field | type | required | description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Parameter name matching `{param}` token in path |
| `description` | `string` | yes | Human-readable description for help text |
| `required` | `boolean` | yes | Whether the parameter must be provided |

**Mapping to CLI**: Path params are folded into the unified command schema as string fields with schema key `name`. Required params produce required schema fields; optional params produce optional fields.

### EsQueryParam

Describes a query string parameter.

| field | type | required | description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Query parameter name as sent to Elasticsearch (snake_case) |
| `cliFlag` | `string` | no | Override kebab-case CLI flag name. Auto-derived from `name` if omitted |
| `type` | `"string" \| "number" \| "boolean"` | yes | Value type for parsing and validation |
| `description` | `string` | yes | Human-readable description for help text |
| `required` | `boolean` | no | Whether the parameter must be provided. Defaults to `false` |
| `defaultValue` | `string \| number \| boolean` | no | Default value when not provided |

**Mapping to CLI**: Query params are folded into the unified command schema with schema key `cliFlag ?? name`. The `name` field (snake_case) is the ES querystring key; `buildRequestParams` maps the input key back to `name` using the definition's `queryParams` list.

### HttpMethod

Type alias: `"GET" | "POST" | "PUT" | "DELETE" | "HEAD"`

## Unified Command Schema

**This is the central design invariant of the registry.**

`registerEsCommands` synthesizes a single flat Zod schema for each API definition. Every parameter — path, query, and body — is a top-level key. There is no `body` wrapper key; body fields are peers of path and query params from the user's perspective.

```
unified schema = z.looseObject({
  // one field per pathParam (string, required or optional)
  [pathParam.name]: z.string()

  // one field per queryParam (string | number | boolean)
  [queryParam.cliFlag ?? queryParam.name]: z.string() | z.number() | z.boolean()

  // one field per body object field (except underscore-prefixed fields like _meta,
  // which are excluded from CLI flags but can be supplied via --file/stdin)
  [bodyField.name]: <bodyField.schema>
})
```

`z.looseObject` (passthrough mode) is used so that underscore-prefixed body fields (e.g., `_meta`) and other fields not registered as CLI flags can still be supplied via `--file` or stdin without being rejected by schema validation.

This schema is passed as `input` to `defineCommand`, which:
1. Registers each top-level key as a `--flag` CLI option (with type coercion)
2. Registers `--file` for reading a JSON object from a file
3. Reads stdin when not a TTY
4. Merges CLI flags over any file/stdin JSON
5. Validates the merged result against the schema
6. Delivers the validated object to the handler as `parsed.input`

`buildRequestParams` then uses the definition's param arrays as a **routing manifest** to classify each key in `parsed.input` back to its destination:
- `pathParams` entries: input key `name`, path template token `name`
- `queryParams` entries: input key `cliFlag ?? name`, querystring key `name`
- `body` shape keys: collected from `parsed.input` and reconstructed into a body object

No keys from `parsed.options` are used for ES API commands — all user input flows through `parsed.input`.

## Relationships

```text
EsApiDefinition
├── has many → EsPathParam (via pathParams[])
├── has many → EsQueryParam (via queryParams[])
└── has one → z.ZodObject (via body, optional)

Namespace Registry File (e.g., cat.ts)
└── exports → EsApiDefinition[] (array of definitions for one namespace)

Barrel (apis/index.ts)
└── imports all namespace files
└── exports → EsApiDefinition[] (flat array of all definitions)

Registration (register.ts)
├── reads → EsApiDefinition[] from barrel
├── validates each definition (validateApiDefinition, including collision check)
├── groups by → namespace
├── for each definition:
│   ├── builds → unified Zod schema (pathParams + queryParams + body fields, all top-level)
│   └── creates → Commander command (via defineCommand, schema passed as input)
├── creates → Commander group per namespace (via defineGroup)
└── returns → top-level "es" OpaqueCommandHandle

Request Builder (request-builder.ts)
├── reads → EsApiDefinition (routing manifest)
├── reads → parsed.input (unified flat object from factory)
├── extracts → path values (input key: name; template token: name)
├── extracts → querystring values (input key: cliFlag ?? name; qs key: name)
├── collects → body (body shape keys from parsed.input, reconstructed as object)
└── returns → TransportRequestParams

Generic Handler (handler.ts)
├── reads → EsApiDefinition (bound at registration time)
├── reads → ParsedResult (input from factory-validated unified schema)
├── calls → Request Builder
├── calls → Transport.request()
└── returns → JsonValue (response body)
```

## State Transitions

API definitions are static data — no runtime state transitions. The only lifecycle is:

1. **Load**: Namespace files are imported at module load time (static imports)
2. **Register**: Definitions are iterated; a unified schema is synthesized per definition and registered as Commander commands during CLI initialization
3. **Execute**: When a user invokes a command, the factory validates all params via the unified schema, then the bound handler fires with `parsed.input` containing the fully-validated flat param object

## Data Volume

- `cat` namespace: ~25 API definitions
- `indices` namespace: ~37 API definitions
- Full ES API surface (future): ~400+ definitions across ~20 namespaces
- Each definition is a small plain object (~200-500 bytes in memory)
- Total memory for 400 definitions: <200KB -- negligible
