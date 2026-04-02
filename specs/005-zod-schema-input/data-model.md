# Data Model: Schema-Driven Input Validation

**Feature**: 005-zod-schema-input
**Date**: 2026-04-01

## Entities

### SchemaArgDefinition

Represents a single CLI argument derived from a top-level key in a command's input schema.

| Field | Type | Description |
|-------|------|-------------|
| `schemaKey` | `string` | Original key name as defined in the Zod schema (e.g., `num_shards`, `refreshInterval`) |
| `cliFlag` | `string` | Kebab-case flag name derived from `schemaKey` (e.g., `num-shards`, `refresh-interval`) |
| `type` | `'string' \| 'number' \| 'boolean' \| 'object' \| 'array'` | Declared type from schema introspection |
| `required` | `boolean` | Whether the field is required (no default, not optional) |
| `defaultValue` | `unknown \| undefined` | Default value from the schema, if any |
| `description` | `string` | Description from the schema's metadata, used in help text |

**Identity**: Unique by `schemaKey` within a single command. Unique by `cliFlag` across all registered arguments for a command (enforced at registration time).

**Validation rules**:
- `cliFlag` must not collide with reserved flags (`help`, `version`, `format`, `config`, `context`, `file`)
- `cliFlag` must not collide with any other schema-derived flag in the same command
- Two schema keys must not produce the same `cliFlag` value

### FlagKeyMap

A bidirectional mapping between kebab-case CLI flag names and original schema keys for a single command.

| Field | Type | Description |
|-------|------|-------------|
| `toSchemaKey` | `Map<string, string>` | Maps `cliFlag` → `schemaKey` for reverse lookup during merge |
| `toCliFlag` | `Map<string, string>` | Maps `schemaKey` → `cliFlag` for registration and help text |

**Lifecycle**: Created once at command registration time. Immutable after creation.

### MergedInput

The result of combining JSON input and CLI arguments before schema validation.

| Field | Type | Description |
|-------|------|-------------|
| `source` | `Record<string, 'json' \| 'cli'>` | Tracks provenance of each key (for diagnostics) |
| `values` | `Record<string, unknown>` | The merged key-value pairs, keyed by original schema key names |

**State transitions**:
1. **Empty** → initial state
2. **JSON-populated** → after JSON input is parsed (if provided)
3. **CLI-overlaid** → after CLI argument values override/extend JSON values
4. **Defaults-applied** → after schema defaults fill in missing fields
5. **Validated** → after Zod schema validation passes (terminal state)

If validation fails at step 5, the command exits with an error; the merged input never reaches the handler.

## Relationships

```
CommandConfig
  └── input: ZodSchema
        └── (introspected at registration) → SchemaArgDefinition[]
                                              └── FlagKeyMap
                                                    └── (used at runtime) → MergedInput
                                                          └── (validated) → ParsedResult.input
```

- One `CommandConfig` has zero or one `input` schema
- One `input` schema produces zero or more `SchemaArgDefinition` entries (one per top-level key)
- One set of `SchemaArgDefinition` entries produces exactly one `FlagKeyMap`
- At runtime, one invocation produces exactly one `MergedInput` (possibly empty if no input provided)
- A validated `MergedInput` becomes the `input` field of `ParsedResult<T>`
