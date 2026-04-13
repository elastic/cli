# Contract: ParsedResult Interface

The `ParsedResult` interface is the public contract between the factory and command handlers. This feature extends it with an `input` field.

## Interface

```typescript
export interface ParsedResult {
  /** parsed and type-coerced options, keyed by long option name */
  options: Record<string, string | number | boolean>
  /** resolved configuration from the active context, injected by the preAction hook */
  config?: ResolvedConfig
  /** parsed JSON input from --file or stdin; undefined when no input provided */
  input?: unknown
}
```

## Behavior Contract

### `input` field semantics

| Condition | `input` value |
|-----------|---------------|
| `CommandConfig.input` is `false` / `undefined` | Always `undefined` (field absent) |
| `CommandConfig.input` is `true`, no `--file`, stdin is TTY | `undefined` |
| `CommandConfig.input` is `true`, `--file` provided with valid JSON | Parsed JSON value |
| `CommandConfig.input` is `true`, stdin piped with valid JSON | Parsed JSON value |
| `CommandConfig.input` is `true`, `--file` with invalid/empty JSON | Error before handler (handler never called) |
| `CommandConfig.input` is `true`, stdin with invalid/empty JSON | Error before handler (handler never called) |
| `CommandConfig.input` is `true`, both `--file` and stdin | Error before handler (handler never called) |

### Error behavior

All input errors are raised via `cmd.error()` before the handler is invoked. The handler can assume: if it is called and `config.input` is `true`, then `parsed.input` is either `undefined` (no input given) or a valid parsed JSON value.

## CommandConfig Extension

```typescript
export interface CommandConfig {
  name: string
  description: string
  options?: OptionDefinition[]
  handler: (parsed: ParsedResult) => void | Promise<void>
  /** when true, enables JSON input via --file and stdin */
  input?: boolean
}
```

### Constraint

When `input` is `true`, no entry in `options` may have `long === 'file'`. Violation throws at definition time (not at runtime).
