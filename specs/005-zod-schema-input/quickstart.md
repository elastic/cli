# Quickstart: Schema-Driven Input Validation

**Feature**: 005-zod-schema-input
**Date**: 2026-04-01

## What this feature does

Commands that accept structured input define a Zod schema. The framework automatically:

1. Generates CLI arguments from every top-level schema key
2. Accepts JSON input via `--file` or stdin
3. Merges both sources (CLI wins) and validates against the schema
4. Shows all arguments in `--help` output

## How to define a command with schema-driven input

```ts
import { z } from 'zod'
import { defineCommand } from './factory.ts'

const inputSchema = z.object({
  index: z.string().describe('Index name to search'),
  num_shards: z.number().default(1).describe('Number of shards'),
  verbose: z.boolean().default(false).describe('Enable verbose output'),
})

const searchCmd = defineCommand({
  name: 'search',
  description: 'Search an Elasticsearch index',
  input: inputSchema,
  handler: (parsed) => {
    // parsed.input is typed as { index: string, num_shards: number, verbose: boolean }
    return { status: 'ok', index: parsed.input!.index }
  },
})
```

## How users invoke it

### CLI arguments only

```sh
elastic search --index my-index --num-shards 3 --verbose
```

### JSON file only

```sh
elastic search --file input.json
```

### JSON from stdin

```sh
echo '{"index": "my-index", "num_shards": 3}' | elastic search
```

### JSON + CLI override

```sh
# Use base config from file, override num_shards
elastic search --file base.json --num-shards 5
```

### Non-primitive values via JSON string

```sh
elastic create-index --mappings '{"dynamic": false}'
```

## Key behaviors

- Schema key `num_shards` → CLI flag `--num-shards` (kebab-case)
- Schema key `refreshInterval` → CLI flag `--refresh-interval`
- `--verbose` (no value) = `true`; `--verbose false` = `false`
- Unknown keys are rejected with a validation error
- Missing fields with schema defaults are filled automatically
- Invalid JSON strings for object/array fields fail before execution

## Help output

```sh
elastic search --help
```

Shows all schema-derived arguments with types, defaults, and descriptions.
