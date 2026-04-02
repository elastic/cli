# Feature spec: Schema-Driven Input Validation

**Feature Branch**: `005-zod-schema-input`
**Created**: 2026-04-01
**Status**: Draft
**Input**: User description: "All commands that support taking input are now required to provide a Zod schema to define what a valid input looks like. Top-level values in the schema double as definitions for each CLI argument. JSON and CLI arguments merge with CLI precedence. Non-string values are coerced. Non-primitive CLI arguments accept JSON strings."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provide input via CLI arguments derived from schema (Priority: P1)

A user invokes a command that expects structured input. Instead of providing a JSON payload, the user supplies each value as a CLI argument. The CLI derives the available arguments directly from the command's input schema, so every top-level key in the schema is automatically a valid CLI flag. Schema keys written in snake_case or camelCase are converted to kebab-case for the CLI argument name (e.g., schema key `num_replicas` becomes `--num-replicas`, schema key `numReplicas` becomes `--num-replicas`).

**Why this priority**: This is the most common interaction pattern for CLI users. Making every schema key a CLI flag removes the need to remember a separate argument list and ensures consistency between JSON and CLI interfaces.

**Independent Test**: Run a command that defines an input schema with several top-level keys in mixed casing conventions. Pass each key as a `--kebab-case-flag value` argument. Verify the command receives all values correctly mapped back to their original schema keys and executes successfully.

**Acceptance Scenarios**:

1. **given** a command with a schema containing keys `index` and `num_shards`, **when** the user runs `command --index my-index --num-shards 3`, **then** the command receives `{ index: "my-index", num_shards: 3 }` as input
2. **given** a command with a schema containing a boolean key `verbose`, **when** the user runs `command --verbose` (no value), **then** the value is set to the boolean `true`
3. **given** a command with a schema containing a boolean key `verbose`, **when** the user runs `command --verbose false`, **then** the value is set to the boolean `false`
4. **given** a command with a schema containing a numeric key `replicas`, **when** the user runs `command --replicas 2`, **then** the value is coerced to the number `2`
5. **given** a command with a schema containing a camelCase key `refreshInterval`, **when** the user runs `command --refresh-interval 30`, **then** the command receives `{ refreshInterval: 30 }` as input
6. **given** a command with a schema containing a snake_case key `api_key`, **when** the user runs `command --api-key abc123`, **then** the command receives `{ api_key: "abc123" }` as input

---

### User Story 2 - Provide input via JSON (Priority: P1)

A user provides the full input payload as JSON (e.g., piped from a file or passed inline). The JSON is validated against the command's schema before any operations are performed. JSON keys use whatever casing the schema defines (no kebab-case conversion applies to JSON input).

**Why this priority**: JSON input is essential for automation, scripting, and complex payloads. It is equally important as CLI arguments and shares the same priority.

**Independent Test**: Run a command that defines an input schema. Provide a valid JSON object as input. Verify the command receives all values correctly and executes successfully.

**Acceptance Scenarios**:

1. **given** a command with a schema, **when** the user provides valid JSON input matching the schema, **then** the command receives the parsed values and executes
2. **given** a command with a schema, **when** the user provides JSON input that violates the schema, **then** the command fails with a clear validation error before any operations are performed
3. **given** a command with a schema, **when** the user provides malformed JSON, **then** the command fails with a clear parse error before any operations are performed

---

### User Story 3 - Merge JSON and CLI arguments with CLI precedence (Priority: P1)

A user has a base JSON payload (e.g., stored in a file) that they reuse across multiple command executions. For specific runs, the user needs to override one or two values without editing the file. The user provides both JSON input and CLI arguments; CLI arguments take precedence over JSON values. CLI arguments provided in kebab-case are mapped back to their original schema key casing before merging.

**Why this priority**: This is a core ergonomic feature enabling efficient workflows. Without merge-with-override, users must duplicate and modify JSON files for every variation, which is error-prone and tedious.

**Independent Test**: Run a command providing both a JSON payload with `{ "index": "base", "num_shards": 1 }` and CLI argument `--num-shards 5`. Verify the resulting input is `{ index: "base", num_shards: 5 }`.

**Acceptance Scenarios**:

1. **given** JSON input `{ "index": "logs", "num_shards": 1 }` and CLI argument `--num-shards 5`, **when** the command executes, **then** the merged input is `{ index: "logs", num_shards: 5 }`
2. **given** JSON input `{ "index": "logs" }` and CLI argument `--replicas 2`, **when** the command executes, **then** the merged input is `{ index: "logs", replicas: 2 }`
3. **given** only JSON input with no CLI arguments, **when** the command executes, **then** the JSON input is used as-is
4. **given** only CLI arguments with no JSON input, **when** the command executes, **then** the CLI arguments are used as-is

---

### User Story 4 - Pass non-primitive values as JSON strings via CLI (Priority: P2)

A user needs to provide a complex value (object or array) for a CLI argument. The user passes a JSON string as the argument value. The system parses and validates it.

**Why this priority**: Needed for completeness but less common than simple key-value arguments. Most day-to-day usage involves primitive values.

**Independent Test**: Run a command where the schema expects an array or object for a key. Pass a JSON string as the CLI argument value. Verify it is parsed and the command receives the correct structured value.

**Acceptance Scenarios**:

1. **given** a schema key `mappings` expecting an object, **when** the user runs `command --mappings '{"dynamic": false}'`, **then** the value is parsed as `{ dynamic: false }`
2. **given** a schema key `tags` expecting an array, **when** the user runs `command --tags '["prod", "v2"]'`, **then** the value is parsed as `["prod", "v2"]`
3. **given** a schema key `mappings` expecting an object, **when** the user runs `command --mappings 'not valid json'`, **then** the command fails with a clear error before any operations are performed

---

### User Story 5 - Schema validation catches invalid input early (Priority: P2)

A user provides input (via JSON, CLI arguments, or both) that does not conform to the command's schema. The command fails immediately with a clear, actionable error message before performing any operations.

**Why this priority**: Early validation prevents partial execution and wasted time, but the validation mechanism is a natural consequence of the schema-driven design rather than a standalone feature.

**Independent Test**: Run a command providing input that violates schema constraints (wrong type, missing required field, extra unknown field). Verify the command exits with a descriptive validation error and no side effects occur.

**Acceptance Scenarios**:

1. **given** a required field `index` in the schema, **when** the user omits it, **then** the command fails with an error identifying the missing field
2. **given** a field `num_shards` expecting a number, **when** the user provides a non-numeric, non-coercible value via `--num-shards`, **then** the command fails with an error identifying the type mismatch
3. **given** the merged input from JSON and CLI arguments, **when** the merged result violates the schema, **then** the command fails with a clear validation error

---

### User Story 6 - Discover available arguments via help output (Priority: P2)

A user runs `command --help` to learn what arguments are available. The help output lists every CLI argument derived from the schema, including the argument name (in kebab-case), the expected type, whether it is required or optional, and a description if one is provided in the schema.

**Why this priority**: Discoverability is critical for usability, especially for LLM-powered agents that rely on `--help` to understand what a command accepts. Without complete help output, users must consult external documentation.

**Independent Test**: Run `command --help` for a command with a multi-field schema. Verify the output lists all schema-derived arguments with their types, required/optional status, and descriptions.

**Acceptance Scenarios**:

1. **given** a command with a schema containing keys `index` (string, required), `num_shards` (number, optional), and `verbose` (boolean, optional), **when** the user runs `command --help`, **then** the output lists `--index`, `--num-shards`, and `--verbose` with their types and required/optional status
2. **given** a schema key with a description defined in the schema, **when** the user runs `command --help`, **then** the description appears next to the corresponding argument
3. **given** a schema key expecting a non-primitive type (object or array), **when** the user runs `command --help`, **then** the argument entry indicates it accepts a JSON string

---

### Edge Cases

- What happens when a CLI argument name conflicts with a built-in CLI framework flag (e.g., `--help`, `--version`)?
- When JSON input or CLI arguments contain keys not defined in the schema, the command MUST reject the input with a validation error identifying the unknown key(s). This prevents silent misconfiguration from typos.
- What happens when a CLI argument value looks like a JSON string but the schema expects a plain string (e.g., `--name '{"foo": "bar"}'` where `name` is a string type)?
- What happens when a numeric string is provided for a field the schema defines as a string (no coercion should occur)?
- What happens when the JSON input is an empty object `{}`?
- What happens when no input is provided at all but the schema has required fields?
- What happens when two schema keys produce the same kebab-case argument name (e.g., `num_shards` and `numShards` both become `--num-shards`)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every command that accepts structured input MUST define an input schema that describes the shape of valid input
- **FR-002**: Every top-level key in a command's input schema MUST be automatically available as a CLI argument, with the argument name converted to kebab-case (e.g., schema key `num_shards` becomes `--num-shards`, schema key `refreshInterval` becomes `--refresh-interval`)
- **FR-003**: When both JSON input and CLI arguments are provided, the system MUST merge them into a single input object with CLI arguments taking precedence over JSON values. CLI argument names in kebab-case MUST be mapped back to their original schema key casing before merging
- **FR-004**: When a schema defines a non-string primitive type (number, boolean) for a field, the system MUST coerce CLI argument string values to the correct type. For boolean fields, providing the flag with no value (e.g., `--verbose`) MUST be interpreted as `true`; an explicit `--flag false` MUST set the value to `false`
- **FR-005**: When a schema defines a non-primitive type (object, array) for a field, the system MUST accept a JSON string as the CLI argument value and parse it
- **FR-006**: When a JSON string provided for a non-primitive CLI argument is not valid JSON, the system MUST fail with a clear error before any operations are performed
- **FR-007**: After merging JSON and CLI input, the system MUST validate the merged result against the schema before executing any operations
- **FR-008**: Validation errors MUST clearly identify which field(s) failed and why, so the user can correct their input without guessing
- **FR-009**: Schema keys that would conflict with built-in CLI flags MUST be handled gracefully (either by prefixing, aliasing, or producing a clear error at command registration time)
- **FR-010**: When the schema expects a string type for a field, the CLI argument value MUST be used as-is without attempting JSON parsing or type coercion
- **FR-011**: The `--help` output for every command with an input schema MUST list all schema-derived CLI arguments, including their kebab-case name, expected type, required/optional status, and description (if provided in the schema)
- **FR-012**: If two or more schema keys produce the same kebab-case CLI argument name, the system MUST detect this at command registration time and produce a clear error
- **FR-013**: When JSON input or CLI arguments contain keys not defined in the input schema, the system MUST reject the input with a validation error identifying the unknown key(s)
- **FR-014**: When a schema field defines a default value and no value is provided for that field via JSON or CLI arguments, the system MUST apply the schema default before validation

### Key Entities

- **Input Schema**: A declarative definition of the shape, types, constraints, and default values of valid input for a command. Each top-level key defines both a JSON property and a CLI argument.
- **CLI Argument**: A command-line flag derived from a top-level key in the input schema. The flag name is the kebab-case form of the schema key. Accepts string values that may be coerced or parsed based on the schema's type definition.
- **JSON Input**: A structured payload provided as JSON (e.g., from a file or stdin) that conforms to the input schema. Keys use the original schema casing.
- **Merged Input**: The result of combining JSON input and CLI arguments, with CLI arguments overriding JSON values for the same key. Keys use the original schema casing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of commands that accept structured input define an input schema, and every top-level schema key is usable as a CLI argument
- **SC-002**: Users can override any single value from a JSON input file via a CLI argument in under 5 seconds of additional typing
- **SC-003**: Invalid input (schema violations, malformed JSON) is rejected before any operations execute, with zero partial side effects
- **SC-004**: Validation error messages identify the specific field and constraint violated, enabling the user to correct input on the first retry in 90%+ of cases
- **SC-005**: Type coercion for numbers and booleans succeeds silently for all unambiguous values (e.g., `"3"` → `3`, `"true"` → `true`)
- **SC-006**: Running `--help` for any command with an input schema displays 100% of the schema-derived arguments with their types and required/optional status
- **SC-007**: Users (including LLM-powered agents) can determine all accepted arguments for a command solely from its `--help` output, without consulting external documentation

## Assumptions

- The CLI already has a mechanism for commands to receive JSON input (e.g., via stdin or a `--json` flag); this feature standardizes and extends that mechanism
- Schema definitions are provided by command authors at command registration time, not by end users
- Only top-level schema keys become CLI arguments; nested keys are not flattened into dot-notation flags
- The merge strategy is shallow: CLI arguments override top-level keys only; nested objects provided via JSON are replaced wholesale if the same key is provided via CLI as a JSON string
- Boolean CLI arguments support flag-style usage: `--flag` (no value) means `true`, `--flag false` explicitly sets `false`. Omitting the flag entirely means the field is absent (subject to schema defaults). String coercion also accepts `"true"` / `"false"` (case-insensitive)
- Commands that do not accept structured input are unaffected by this feature
- The kebab-case conversion is deterministic and reversible: given the original schema key casing convention (snake_case or camelCase), the system can unambiguously map a kebab-case CLI argument back to its schema key
- Schema descriptions for arguments are optional; when absent, the help output still lists the argument with its name and type

## Clarifications

### Session 2026-04-01

- Q: Should unknown keys in JSON or CLI input be rejected, silently ignored, or warned about? → A: Reject with a validation error (strict mode). Unknown keys indicate typos or misconfiguration and must fail early.
- Q: Should boolean schema fields require an explicit value (`--verbose true`) or support flag-style (`--verbose` alone = `true`)? → A: Flag-style. `--flag` alone means `true`; `--flag false` to negate; omitting the flag means absent.
- Q: When a schema field has a default and the user provides no value via JSON or CLI, should the default apply automatically? → A: Yes. Schema defaults are applied automatically for any field not provided, before validation runs.