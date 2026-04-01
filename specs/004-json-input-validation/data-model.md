# Data Model: JSON Input Schema Validation

**Branch**: `004-json-input-validation` | **Date**: 2026-04-01

## Entities

### CommandConfig (modified)

The existing `CommandConfig` interface gains a generic type parameter and the `input` property is expanded.

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `name` | `string` | unchanged | Command name |
| `description` | `string` | unchanged | Help text description |
| `options` | `OptionDefinition[]` | unchanged | CLI option definitions |
| `handler` | `(parsed: ParsedResult<T>) => void \| Promise<void>` | **modified** | Handler now receives typed `ParsedResult<T>` |
| `input` | `boolean \| z.ZodType` | **modified** | Was `boolean \| undefined`; now also accepts a Zod schema |

**Validation rules**:
- `input` must be `undefined`, `true`, or an instance of `z.ZodType`
- When `input` is a `z.ZodType`, `--file` is reserved (existing collision check applies)
- When `input` is `false` or `undefined`, no `--file` option is registered

### ParsedResult (modified)

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `options` | `Record<string, string \| number \| boolean>` | unchanged | Parsed CLI options |
| `config` | `ResolvedConfig` | unchanged | Resolved config context |
| `input` | `T \| unknown \| undefined` | **modified** | Was `unknown \| undefined`; now carries schema output type `T` when schema provided, remains `unknown` for `input: true` |

**State transitions for `input` field**:
1. No `input` config → `ParsedResult.input` is `undefined` (no `--file`, no stdin reading)
2. `input: true` → `ParsedResult.input` is `unknown` when data provided, `undefined` when not (backward compat)
3. `input: <ZodSchema>` + data provided → `ParsedResult.input` is `z.infer<typeof schema>` (validated + typed)
4. `input: <ZodSchema>` + no data → `ParsedResult.input` is `undefined` (validation skipped)

### ValidationError (new, conceptual)

Not a standalone entity — errors are surfaced through `cmd.error()` (text mode) or stdout JSON (JSON mode).

| Field | Source | Description |
|-------|--------|-------------|
| `code` | `"input_validation_failed"` | Error code for JSON output |
| `message` | `z.prettifyError(error)` | Human-readable summary |
| `issues` | `ZodError.issues` | Array of `{ code, path, message, expected }` objects |

## Relationships

```
CommandConfig --has--> input (ZodType | boolean | undefined)
                          |
                    [if ZodType]
                          |
                   parseJsonContent() output
                          |
                     safeParse(data)
                        /       \
                   success      failure
                      |            |
              ParsedResult    cmd.error() / JSON error
              (typed T)       (exits non-zero)
```
