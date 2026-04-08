# Quickstart: External Zod Schema Integration

**Branch**: `007-external-zod-schema-integration` | **Date**: 2026-04-03

## What Changed

The ES API command system now uses a **unified Zod schema** for all parameters. Instead of defining path, query, and body parameters separately in `EsApiDefinition`, all parameters are top-level fields in a single Zod schema, each annotated with `.meta({ found_in: "path" | "query" | "body" })`.

## Before (old pattern)

```typescript
const def: EsApiDefinition = {
  name: 'create',
  namespace: 'indices',
  description: 'Creates a new index',
  method: 'PUT',
  path: '/{index}',
  pathParams: [
    { name: 'index', description: 'Name of the index', required: true },
  ],
  queryParams: [
    { name: 'wait_for_active_shards', type: 'string', description: 'Wait for active shards' },
  ],
  body: z.object({
    settings: z.record(z.string(), z.unknown()).optional().describe('Index settings'),
    mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings'),
  }),
}
```

## After (new pattern)

```typescript
// Schema may come from @elastic/zod or be defined locally
const createIndexSchema = z.looseObject({
  index:    z.string().describe('Name of the index').meta({ found_in: 'path' }),
  wait_for_active_shards: z.string().optional().describe('Wait for active shards').meta({ found_in: 'query' }),
  settings: z.record(z.string(), z.unknown()).optional().describe('Index settings').meta({ found_in: 'body' }),
  mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings').meta({ found_in: 'body' }),
})

const def: EsApiDefinition = {
  name: 'create',
  namespace: 'indices',
  description: 'Creates a new index',
  method: 'PUT',
  path: '/{index}',
  input: createIndexSchema,
}
```

## Key Rules

1. **`.meta()` last**: Apply `.meta({ found_in: ... })` as the outermost call on each field
2. **Schema keys are snake_case**: They serve as ES-native parameter names; CLI flags are auto-derived via kebab-case conversion
3. **Use `z.looseObject()`** when the body may include fields not listed in the schema (e.g., underscore-prefixed fields via `--file`/stdin)
4. **Default routing**: Fields without `found_in` metadata are treated as `"body"` parameters
5. **Path template consistency**: Every `{param}` in the path must have a `found_in: "path"` field in the schema, and vice versa

## Using Schemas from @elastic/zod

```typescript
import { createIndexSchema } from '@elastic/zod/indices'

const def: EsApiDefinition = {
  name: 'create',
  namespace: 'indices',
  description: 'Creates a new index',
  method: 'PUT',
  path: '/{index}',
  input: createIndexSchema,  // schema from external library
}
```

The CLI's command factory handles the rest — extracting `found_in` metadata, registering CLI flags, building help text, and routing parameters to the correct HTTP location at request time.
