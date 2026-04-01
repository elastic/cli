# Research: JSON Input Schema Validation

**Branch**: `004-json-input-validation` | **Date**: 2026-04-01

## R1: How to detect whether `input` is a Zod schema vs `true`

**Decision**: Use `instanceof z.ZodType` to distinguish schemas from the legacy `input: true` boolean at runtime.

**Rationale**: Zod v4 exports `ZodType` as the base class for all schema types. `instanceof` is the idiomatic runtime check and works for all schema subclasses (`ZodObject`, `ZodString`, `ZodArray`, etc.). The project already imports `z` from `zod`, so no new imports are needed.

**Alternatives considered**:
- Duck-typing via `'_zod' in value` or `typeof value.safeParse === 'function'` — fragile, not future-proof
- `typeof input === 'object'` — would also match plain objects, not specific enough

## R2: Validation API — `safeParse` vs `parse`

**Decision**: Use `schema.safeParse(data)` for validation.

**Rationale**: `safeParse` returns a discriminated union `{ success: true, data } | { success: false, error }` without throwing. This allows the factory to handle errors gracefully via `cmd.error()` instead of relying on try/catch. All validation issues are collected (not just the first), matching FR-004's requirement to report all errors.

**Alternatives considered**:
- `schema.parse(data)` — throws `ZodError` on failure, requiring try/catch; less explicit control flow
- Standard Schema interface — adds abstraction layer; unnecessary since the project is committed to Zod

## R3: Error formatting for human-readable output

**Decision**: Use `z.prettifyError(error)` for plain-text error output. Use `error.issues` array for JSON error output.

**Rationale**: Zod v4 provides `z.prettifyError()` which returns a formatted string with field paths and clear messages, e.g.:
```
✖ Invalid input: expected string, received number
  → at name
✖ Invalid input: expected number, received string
  → at favoriteNumbers[1]
```
This is human-readable and also parseable enough for LLM agents. For `--format=json`, the raw `error.issues` array provides structured data with `code`, `path`, `message`, and `expected` fields.

**Alternatives considered**:
- `z.treeifyError()` — returns nested object; good for UI but harder to render as flat text
- `z.formatError()` — deprecated in Zod v4 in favor of `treeifyError`
- Manual iteration over `error.issues` — unnecessary given `prettifyError` exists

## R4: TypeScript type inference for `ParsedResult.input`

**Decision**: Make `CommandConfig` generic over the schema type, using `z.infer<T>` to derive the input type. The handler's `ParsedResult.input` will carry the inferred type.

**Rationale**: Zod v4 supports `z.infer<typeof schema>` to extract the TypeScript output type from a schema. By making `CommandConfig` generic (e.g., `CommandConfig<T extends z.ZodType>`), the handler can receive `ParsedResult<z.infer<T>>` with full type safety. This is the standard Zod pattern for type inference.

**Alternatives considered**:
- Leaving `input` as `unknown` and requiring manual casting — defeats the purpose of schema validation
- Using `z.output<T>` instead of `z.infer<T>` — they are equivalent in Zod v4 (`infer` is an alias for `output`)

## R5: Validation of the `input` config value at definition time

**Decision**: In `defineCommand`, validate that `input` is either `undefined`, `true`, or an instance of `z.ZodType`. Throw an error at definition time for any other value.

**Rationale**: Catching invalid configuration early (at command definition time) prevents confusing runtime errors later. This is consistent with the existing `validateName` and `validateOptions` patterns in `factory.ts`.

**Alternatives considered**:
- Deferring validation to runtime — would allow invalid commands to be registered, failing only when invoked
- Using a Zod schema to validate the config itself — over-engineering for a simple type check

## R6: Error output structure for `--format=json`

**Decision**: When `--format=json` is active and validation fails, emit a JSON object to stdout matching the constitution's error format: `{"error": {"code": "input_validation_failed", "message": "...", "issues": [...]}}`.

**Rationale**: The constitution (Development Standards) mandates `{"error": {"code": "…", "message": "…"}}` for JSON error output. Adding `issues` (the raw Zod issues array) provides machine-parseable field-level details for LLM agents while maintaining the required structure.

**Alternatives considered**:
- Emitting only the Zod issues array — doesn't match the constitution's error format
- Omitting field-level details — would reduce agent self-correction capability (SC-004)

## Open Questions — All Resolved

No remaining NEEDS CLARIFICATION items.
