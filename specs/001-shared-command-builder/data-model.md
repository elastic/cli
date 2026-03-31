# Data Model: Shared Command Builder

**Branch**: `001-shared-command-builder` | **Date**: 2026-03-30

## Entities

### CommandConfig

The declarative configuration object passed to `defineCommand`. Fully describes a leaf command.

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | yes | Command name (used in CLI invocation) |
| description | string | yes | Human-readable description (used in help text) |
| options | OptionDefinition[] | No | Named option/flag definitions |
| handler | (parsed: ParsedResult) => void \| Promise\<void\> | Yes | Callback invoked with typed parsed result |

### GroupConfig

The declarative configuration object passed to `defineGroup`. Describes a command group (non-leaf).

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | yes | Group name (used in CLI invocation) |
| description | string | yes | Human-readable description (used in group help) |

### OptionDefinition

Defines a named option or boolean flag.

| field | type | required | description |
|-------|------|----------|-------------|
| long | string | yes | Long option name without `--` prefix (e.g., 'output') |
| short | string | No | Single-character short alias without `-` prefix (e.g., 'o') |
| description | string | yes | Human-readable description |
| type | 'string' \| 'number' \| 'boolean' | No | Declared type for coercion (default: 'string') |
| required | boolean | No | Whether the option is required (default: false) |
| defaultValue | string \| number \| boolean | No | Default value if not provided |

### ParsedResult

The typed output of option parsing, passed to the handler callback.

| Field | Type | Description |
|-------|------|-------------|
| options | Record\<string, string \| number \| boolean\> | Parsed options/flags, keyed by long name, coerced to declared types |

## Relationships

```
CommandConfig ──has-many──▶ OptionDefinition
CommandConfig ──has-one───▶ Handler Callback
defineCommand(CommandConfig) ──produces──▶ OpaqueCommandHandle

GroupConfig ──used-by──▶ defineGroup()
defineGroup(GroupConfig,...OpaqueCommandHandle[]) ──produces──▶ OpaqueCommandHandle

OpaqueCommandHandle ──registered-in──▶ CLI Program (src/cli.ts)
```

## Validation Rules

- `name` fields must be non-empty strings containing only lowercase alphanumeric characters and hyphens
- `short` option aliases must be exactly one character
- `long` option names must be at least two characters
- A command cannot have two options with the same name
- If `defaultValue` is provided, its type must match the declared `type`
- Type coercion errors (e.g., non-numeric string for type 'number') produce structured errors before handler invocation
