# Quickstart: Elasticsearch API Registry

**Branch**: `006-es-api-registry` | **Date**: 2026-04-02

## How to Add a New Elasticsearch API Command

### 1. Add a definition to an existing namespace

Open the namespace file (e.g., `src/es/apis/cat.ts`) and add an entry to the array:

```typescript
{
  name: 'nodes',
  namespace: 'cat',
  description: 'Returns information about the nodes in a cluster',
  method: 'GET',
  path: '/_cat/nodes',
  queryParams: [
    { name: 'v', type: 'boolean', description: 'Include column headings' },
    { name: 'h', type: 'string', description: 'Comma-separated list of columns to display' },
  ],
  responseType: 'text',
}
```

That's it. The command is now available as `elastic es cat nodes`.

### 2. Add a definition with path parameters

Path parameters become `--flags` alongside query params — all params are unified into a single flat
schema per command. There are no positional arguments.

```typescript
{
  name: 'get',
  namespace: 'indices',
  description: 'Returns information about one or more indices',
  method: 'GET',
  path: '/{index}',
  pathParams: [
    { name: 'index', description: 'Comma-separated list of index names', required: true },
  ],
  responseType: 'json',
}
```

Usage: `elastic es indices get --index my-index`

### 3. Add a definition with a request body

```typescript
{
  name: 'create',
  namespace: 'indices',
  description: 'Creates a new index',
  method: 'PUT',
  path: '/{index}',
  pathParams: [
    { name: 'index', description: 'Name of the index to create', required: true },
  ],
  body: z.object({
    settings: z.record(z.string(), z.unknown()).optional()
      .describe('Index settings'),
    mappings: z.record(z.string(), z.unknown()).optional()
      .describe('Index mappings'),
  }),
  responseType: 'json',
}
```

Usage:
```bash
# Path + body params all as flags; body is a JSON object passed via --body
elastic es indices create --index my-index --body '{"settings": {"number_of_shards": 1}}'

# Via file (top-level key "body" holds the request body)
elastic es indices create --index my-index --file settings.json

# Via stdin
echo '{"index": "my-index", "body": {"settings": {"number_of_shards": 1}}}' | elastic es indices create
```

### 4. Add a new namespace

1. Create `src/es/apis/cluster.ts`:

```typescript
import type { EsApiDefinition } from '../types.ts'

export const clusterApis: EsApiDefinition[] = [
  {
    name: 'health',
    namespace: 'cluster',
    description: 'Returns the health status of a cluster',
    method: 'GET',
    path: '/_cluster/health',
    responseType: 'json',
  },
]
```

2. Update `src/es/apis/index.ts`:

```typescript
import { catApis } from './cat.ts'
import { indicesApis } from './indices.ts'
import { clusterApis } from './cluster.ts'  // ← add import

export const allApis: EsApiDefinition[] = [
  ...catApis,
  ...indicesApis,
  ...clusterApis,  // ← add spread
]
```

### 5. Test a command

```bash
# Check it appears in help
elastic es cat --help

# Execute against a cluster
elastic es cat health --v

# Show the full JSON schema for a command
elastic es indices create --help --format json
```

## Architecture Overview

```
User invokes: elastic es cat health --v

                ┌──────────────┐
                │   cli.ts     │  registers 'es' group
                └──────┬───────┘
                       │
                ┌──────▼───────┐
                │ register.ts  │  iterates allApis[], builds unified schema
                │              │  per definition, creates groups + commands
                └──────┬───────┘
                       │
             ┌─────────▼──────────┐
             │    factory.ts      │  validates unified schema, coerces types,
             │  (defineCommand)   │  merges --file/stdin, delivers parsed.input
             └─────────┬──────────┘
                       │
                ┌──────▼───────┐
                │  handler.ts  │  generic handler bound to EsApiDefinition
                │              │  1. calls request-builder with parsed.input
                │              │  2. calls transport.request()
                │              │  3. outputs response
                └──────┬───────┘
                       │
          ┌────────────▼────────────┐
          │   request-builder.ts    │  routes keys from parsed.input to
          │   { method, path,       │  path / querystring / body using
          │     querystring, body } │  definition's param arrays as manifest
          └────────────┬────────────┘
                       │
                ┌──────▼───────┐
                │ transport.ts │  lazily creates Transport instance
                │              │  from resolved config context
                └──────────────┘
```
