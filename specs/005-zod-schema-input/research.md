# Research: Schema-Driven Input Validation

**Feature**: 005-zod-schema-input
**Date**: 2026-04-01

## R1: Zod v4 schema introspection API

**Decision**: Use `z.toJSONSchema()` for type metadata extraction and direct Zod type checking (`instanceof z.ZodObject`, `._zod.def.type`) for programmatic introspection of top-level keys, types, defaults, and descriptions.

**Rationale**: Zod v4 exposes a `toJSONSchema()` utility that converts a Zod schema to JSON Schema. This provides a clean way to extract property names, types, required fields, defaults, and descriptions. For cases where we need finer control (e.g., detecting `z.coerce.number()` vs `z.number()`), direct access to Zod's internal type discriminant via `._zod.def.type` is stable in v4.

**Alternatives considered**:
- Manual recursive traversal of Zod internals: fragile, couples to undocumented structure
- Requiring command authors to separately declare arg metadata: violates DRY, conflicts with Constitution Principle I (config-driven)
- Using JSON Schema as the primary schema format instead of Zod: would require replacing the existing Zod validation pipeline and losing TypeScript type inference

## R2: Kebab-case conversion strategy (snake_case / camelCase → kebab-case)

**Decision**: Implement a deterministic `toKebabCase()` function that handles both snake_case and camelCase inputs. Store a reverse mapping (kebab → original key) at registration time to enable unambiguous round-tripping.

**Rationale**: Commander already converts `--kebab-case` flags to camelCase internally. We need to go the other direction: schema key → CLI flag name. The reverse map is essential for merging CLI values back into the schema's key namespace. Collision detection (two schema keys producing the same kebab form) is a registration-time check.

**Alternatives considered**:
- Relying on Commander's camelCase conversion and storing only camelCase keys: doesn't handle snake_case schema keys correctly
- Requiring schema keys to already be in kebab-case: too restrictive, conflicts with YAML config convention (snake_case) and typical TypeScript conventions (camelCase)

## R3: Merge strategy (JSON input + CLI arguments)

**Decision**: Shallow merge with CLI precedence. After parsing JSON and CLI independently, overlay CLI-provided values onto the JSON object using the schema's original key names. Only keys explicitly provided via CLI override JSON values.

**Rationale**: The spec explicitly defines shallow merge with CLI precedence. Deep merge would be surprising for non-primitive values and contradicts the spec's statement that nested objects provided via CLI as JSON strings replace the entire value.

**Alternatives considered**:
- Deep merge: complex, surprising behavior for arrays and nested objects
- No merge (CLI-only or JSON-only): breaks the core use case of overriding specific values from a reusable JSON file

## R4: Boolean flag behavior in Commander

**Decision**: Register boolean schema fields using Commander's built-in boolean flag support. Use `--flag` for `true`, `--no-flag` or `--flag false` for `false`. Commander natively supports this pattern when flags are registered without a value placeholder.

**Rationale**: Commander already handles `--flag` (no value = true) natively for boolean options. The spec's clarification confirms this is the desired behavior. We need to ensure `--flag false` is also handled, which requires a custom argument parser or post-processing since Commander treats `false` as a string argument to the next option.

**Alternatives considered**:
- Always requiring `--flag true` / `--flag false`: unnatural for CLI users, rejected in clarification
- Using `--no-flag` exclusively for negation: valid but less intuitive; `--flag false` should also work

## R5: Non-primitive CLI argument parsing

**Decision**: For schema fields typed as object or array, attempt `JSON.parse()` on the CLI argument value. If parsing fails, error immediately. If parsing succeeds, the parsed value is used as the field value before schema validation.

**Rationale**: The spec requires JSON strings as the only mechanism for non-primitive CLI values. Parsing happens before schema validation so that the full merged input is validated holistically.

**Alternatives considered**:
- Supporting comma-separated values for arrays: ad-hoc, doesn't generalize to objects, and conflicts with values that contain commas
- Supporting repeated flags for arrays (e.g., `--tag prod --tag v2`): would require special detection logic per type; JSON strings are more uniform and already specified

## R6: Help text generation from schema

**Decision**: When a command has an `input` schema, iterate over top-level keys and register each as a Commander option with description sourced from the schema's `description` field (via JSON Schema conversion or Zod metadata). Type is communicated via the value placeholder (`<string>`, `<number>`, `<json>`).

**Rationale**: Constitution Principle III requires `description` on every input field. This makes help text generation automatic — no separate help string authoring. Commander's built-in help formatting handles alignment and display.

**Alternatives considered**:
- Custom help formatter: unnecessary complexity when Commander's built-in formatting works
- Generating a separate help document: doesn't satisfy the `--help` output requirement

## R7: Reserved flag collision detection

**Decision**: At command registration time, check schema-derived flag names against a hardcoded set of reserved names (`help`, `version`, `format`, `config`, `context`, `file`). If a collision is detected, throw an error at startup.

**Rationale**: Fail-fast at registration prevents runtime surprises. The reserved set is small and known. This aligns with FR-009 and the existing pattern in `factory.ts` where `--file` is already checked for collision.

**Alternatives considered**:
- Automatic prefixing (e.g., `--input-help`): confusing, changes the expected flag name
- Runtime conflict resolution: too late, could produce inconsistent behavior across commands

## R8: Unknown key rejection (strict mode)

**Decision**: Configure Zod schema validation with `strict()` or check for unknown keys post-parse. After merging JSON + CLI input, validate the merged object against the schema in strict mode to reject unknown keys.

**Rationale**: The clarification explicitly chose strict rejection. Zod v4's `z.object().strict()` rejects unknown keys by default. If the schema author uses `.passthrough()`, that's their opt-in decision.

**Alternatives considered**:
- Stripping unknown keys silently: rejected in clarification (typos would go unnoticed)
- Warning but proceeding: rejected in clarification
