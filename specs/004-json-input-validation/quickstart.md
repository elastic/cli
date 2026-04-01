# Quickstart: JSON Input Schema Validation

**Branch**: `004-json-input-validation` | **Date**: 2026-04-01

## Adding a schema to a command

1. Define a Zod schema for your command's input:

```ts
import { z } from 'zod'

const myInputSchema = z.object({
  index: z.string(),
  query: z.string().optional(),
  size: z.number().default(10),
})
```

2. Pass it as `input` in your `CommandConfig`:

```ts
import { defineCommand } from './factory.ts'

const searchCmd = defineCommand({
  name: 'search',
  description: 'Search an index',
  input: myInputSchema,
  handler: (parsed) => {
    // parsed.input is fully typed: { index: string, query?: string, size: number }
    console.log(`Searching ${parsed.input?.index} with size ${parsed.input?.size}`)
  },
})
```

3. Users can now provide input via `--file` or stdin:

```bash
# Via file
elastic search --file input.json

# Via stdin
echo '{"index": "my-index", "size": 5}' | elastic search

# Invalid input gets a clear error:
echo '{"size": "not-a-number"}' | elastic search
# error: input validation failed:
# ✖ Invalid input: expected string, received undefined
#   → at index
# ✖ Invalid input: expected number, received string
#   → at size
```

## Typing the handler with a schema

TypeScript infers the input type automatically from the schema:

```ts
const ingestSchema = z.object({
  pipeline: z.string(),
  documents: z.array(z.object({
    _id: z.string().optional(),
    _source: z.record(z.unknown()),
  })),
})

defineCommand({
  name: 'ingest',
  description: 'Ingest data',
  input: ingestSchema,
  handler: (parsed) => {
    // parsed.input is typed: { pipeline: string, documents: Array<...> }
    // no casting required
    const { pipeline, documents } = parsed.input!
    console.log(`Ingesting ${documents.length} docs into pipeline ${pipeline}`)
  },
})
```
