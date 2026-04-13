# Contract: CommandConfig Input Schema

**Branch**: `004-json-input-validation` | **Date**: 2026-04-01

## CommandConfig interface contract

The `input` property of `CommandConfig` accepts two forms:

### Form 1: No input (default)
```ts
defineCommand({
  name: 'ping',
  description: 'Verify connectivity',
  handler: (parsed) => { /* parsed.input is undefined */ }
})
```
- `--file` option is NOT registered
- stdin is NOT read
- `parsed.input` is always `undefined`

### Form 2: Schema-validated input (`input: z.ZodType`)
```ts
const inputSchema = z.object({
  index: z.string(),
  size: z.number().default(10),
})

defineCommand({
  name: 'search',
  description: 'Search the cluster',
  input: inputSchema,
  handler: (parsed) => {
    // parsed.input is { index: string, size: number } — fully typed
  }
})
```
- `--file` option IS registered
- stdin IS read when not a TTY
- If data is provided: validated via `schema.safeParse(data)`
  - Success: `parsed.input` carries the Zod-parsed output with full type information
  - Failure: `cmd.error()` with all validation issues; handler NOT invoked
- If no data is provided: validation is skipped, `parsed.input` is `undefined`

## Error output contract

### Text mode (default)
Validation errors are emitted via `cmd.error()` using `z.prettifyError()` format:
```
error: input validation failed:
✖ Invalid input: expected string, received number
  → at name
✖ Invalid input: expected number, received undefined
  → at count
```

### JSON mode (`--format=json`)
Validation errors are emitted to stdout as a JSON object:
```json
{
  "error": {
    "code": "input_validation_failed",
    "message": "Input validation failed with 2 issue(s)",
    "issues": [
      {
        "code": "invalid_type",
        "expected": "string",
        "path": ["name"],
        "message": "Invalid input: expected string, received number"
      },
      {
        "code": "invalid_type",
        "expected": "number",
        "path": ["count"],
        "message": "Invalid input: expected number, received undefined"
      }
    ]
  }
}
```

## Invalid config contract

Passing a non-ZodType value to `input` throws at definition time:
```ts
// Throws: command "search": input must be a Zod schema
defineCommand({
  name: 'search',
  description: '...',
  input: { some: 'object' },  // not a ZodType instance
  handler: () => {}
})
```
