# Contract: Schema-to-CLI Argument Mapping

**Feature**: 005-zod-schema-input
**Date**: 2026-04-01

## Overview

This contract defines how a Zod input schema on a `CommandConfig` is translated into CLI arguments, how input from multiple sources is merged, and how validation errors are reported.

## 1. Argument Registration Contract

When `CommandConfig.input` is a Zod object schema, the factory MUST:

1. Extract all top-level keys from the schema
2. For each key, derive a kebab-case CLI flag name
3. Register the flag with Commander using the schema's type and description
4. Detect and reject collisions with reserved flags at registration time

### Flag naming rules

| Schema key format | CLI flag | Example |
|-------------------|----------|---------|
| `snake_case` | `--kebab-case` | `num_shards` → `--num-shards` |
| `camelCase` | `--kebab-case` | `refreshInterval` → `--refresh-interval` |
| `lowercase` | `--lowercase` | `index` → `--index` |

### Type-to-flag mapping

| Schema type | Commander registration | Value placeholder | Coercion |
|-------------|----------------------|-------------------|----------|
| `z.string()` | `--flag <string>` | `<string>` | None (as-is) |
| `z.number()` / `z.coerce.number()` | `--flag <number>` | `<number>` | `String → Number` |
| `z.boolean()` | `--flag [value]` | none | Flag-style: present = `true`, `--flag false` = `false` |
| `z.object(...)` | `--flag <json>` | `<json>` | `JSON.parse()`, fail if invalid |
| `z.array(...)` | `--flag <json>` | `<json>` | `JSON.parse()`, fail if invalid |
| `z.enum(...)` | `--flag <value>` | `<value>` | None (validated by schema) |

### Reserved flags (collision disallowed)

`help`, `version`, `format`, `config`, `context`, `file`

## 2. Input Merge Contract

**Precedence order** (highest wins):

1. CLI arguments
2. JSON input (via `--file` or stdin)
3. Schema defaults

**Merge algorithm**:

```
merged = {}

if json_input exists:
  merged = { ...json_input }

for each cli_arg provided:
  schema_key = flagKeyMap.toSchemaKey(cli_arg)
  merged[schema_key] = coerce(cli_arg_value, schema_type)

validated = schema.parse(merged)  // applies defaults for missing keys
```

**Key rules**:
- Merge is shallow (top-level only)
- CLI values are mapped back to original schema key names before merging
- Only explicitly provided CLI arguments override JSON values (absent flags are not merged)
- Schema defaults apply to fields absent from both JSON and CLI

## 3. Validation Error Contract

When validation fails, the error output MUST follow the existing factory error format:

### Text format (default)

```
Error: input validation failed:
  - index: Required
  - num_shards: Expected number, received string

Usage: elastic command [options]

Run "elastic command --help" for more information.
```

### JSON format (`--format=json`)

```json
{
  "error": {
    "code": "input_validation_failed",
    "message": "Input validation failed with 2 issue(s)",
    "issues": [
      { "path": ["index"], "code": "invalid_type", "message": "Required" },
      { "path": ["num_shards"], "code": "invalid_type", "message": "Expected number, received string" }
    ]
  }
}
```

### Unknown key error

```
Error: input validation failed:
  - Unrecognized key: "indx" (did you mean "index"?)

Usage: elastic command [options]

Run "elastic command --help" for more information.
```

## 4. Help Output Contract

When `--help` is invoked for a command with an input schema, the output MUST include all schema-derived arguments in addition to any manually defined options.

### Example output

```
Usage: elastic search [options]

Search an Elasticsearch index

Options:
  --index <string>       Index name to search (required)
  --num-shards <number>  Number of shards (default: 1)
  --verbose              Enable verbose output
  --mappings <json>      Index mappings as a JSON string
  --file <path>          Path to a JSON file to use as command input
  --format <fmt>         Output format: text (default) or json
  -h, --help             Display help for command
```

Schema-derived arguments MUST appear before framework flags (`--file`, `--format`, `--help`).
