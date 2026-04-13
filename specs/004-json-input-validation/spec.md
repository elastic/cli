# Feature spec: JSON Input Schema Validation

**Feature Branch**: `004-json-input-validation`
**Created**: 2026-04-01
**Status**: Draft
**Input**: User description: "Every command can receive JSON as input now. However, there is no way to provide what a valid JSON input can look like. All commands must provide a Zod schema that defines a valid input. When a command is run, pre-flight validation of all input must be run before any other operation is performed. If validation fails, an informative error should be printed and the process should exit with a non-zero status. If Zod can provide a more strongly-typed copy of the plain JSON object that the handler is currently given, input deserialization should handle that as well."

## Clarifications

### Session 2026-04-01

- Q: When a command has a Zod schema but no JSON input is provided (no --file, no stdin), what should happen? → A: Input remains optional — skip validation and pass no `input` to handler, preserving current behavior.
- Q: Should validation errors be plain text or structured output? → A: Default to text-based errors; when a global `--format=json` flag is active, print the error as JSON to stdout and nothing else.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Command author defines an input schema (Priority: P1)

A developer creating a new CLI command specifies a Zod schema alongside their command configuration. This schema describes the shape of valid JSON input for that command. The schema is required for any command that accepts JSON input, ensuring every input-enabled command has a documented, enforceable contract.

**Why this priority**: Without a schema definition mechanism, no validation can occur. This is the foundation for all other stories.

**Independent Test**: Can be fully tested by defining a command with `input` set to a Zod schema and confirming the command registers successfully with the schema attached.

**Acceptance Scenarios**:

1. **given** a command configuration with `input` set to a Zod schema, **when** the command is defined, **then** the command registers successfully and the schema is associated with it
2. **given** a command configuration with `input: true` (legacy boolean), **when** the command is defined, **then** the behavior is unchanged from prior versions for backward compatibility
3. **given** a command configuration with `input` set to an invalid value (e.g., a plain object, a string), **when** the command is defined, **then** an error is thrown at definition time

---

### User Story 2 - Valid JSON input passes pre-flight validation (Priority: P1)

A user (human or LLM agent) provides JSON input via `--file` or stdin that conforms to the command's schema. The input is validated before any handler logic runs. After validation, the handler receives a strongly-typed, parsed copy of the input rather than a plain `unknown` object.

**Why this priority**: This is the core value proposition — ensuring valid input flows through with strong types.

**Independent Test**: Can be fully tested by running a command with valid JSON input and verifying the handler receives a typed, validated object.

**Acceptance Scenarios**:

1. **given** a command with a Zod schema expecting `{ "name": string, "count": number }`, **when** the user provides `{"name": "test", "count": 5}` via stdin, **then** the handler receives the parsed and typed input with correct types
2. **given** a command with a Zod schema, **when** valid JSON is provided via `--file`, **then** the same validation and typing occurs as with stdin
3. **given** a command with a Zod schema that applies transformations (e.g., default values, coercions), **when** the user provides partial but valid JSON, **then** the handler receives the fully transformed output

---

### User Story 3 - Invalid JSON input fails with informative error (Priority: P1)

A user provides JSON input that does not conform to the command's schema. The validation fails before the handler runs, an informative error message is printed describing exactly what was wrong, and the process exits with a non-zero status.

**Why this priority**: Clear error messages are critical for both human users and LLM agents to self-correct their input.

**Independent Test**: Can be fully tested by providing invalid JSON to a schema-enabled command and verifying the error output and exit code.

**Acceptance Scenarios**:

1. **given** a command expecting `{ "name": string }`, **when** the user provides `{"name": 123}`, **then** the CLI prints a text error message indicating the type mismatch for the "name" field and exits with a non-zero status
2. **given** a command expecting `{ "name": string, "count": number }`, **when** the user provides `{"name": "test"}` (missing required field), **then** the error message identifies the missing "count" field
3. **given** invalid input with multiple validation errors, **when** validation runs, **then** all errors are reported together (not just the first one)
4. **given** a command with a schema, **when** validation fails, **then** no handler logic has executed
5. **given** a command with a schema and `--format=json` active, **when** validation fails, **then** the error is printed as structured JSON to stdout with no other output, and the process exits with a non-zero status

---

### User Story 4 - Commands without input schemas reject JSON input (Priority: P2)

A command that does not accept JSON input (no `input` configuration) does not accept `--file` or stdin data. This preserves existing behavior and prevents users from sending data to commands that cannot process it.

**Why this priority**: Important for correctness but already partially handled by existing behavior.

**Independent Test**: Can be fully tested by running a command without `input` configured and verifying that `--file` is not available and stdin data is ignored.

**Acceptance Scenarios**:

1. **given** a command with no `input` property, **when** the user tries to pass `--file`, **then** the option is not recognized
2. **given** a command with no `input` property, **when** data is piped via stdin, **then** the data is ignored and the command runs normally

---

### Edge Cases

- What happens when valid JSON is provided but it contains additional properties not in the schema? Zod's default behavior (strip unknown keys) should apply, maintaining safety without being overly strict.
- What happens when the JSON input is syntactically valid but semantically empty (e.g., `{}`)? The schema determines validity — if all fields are optional, it passes; if required fields exist, it fails with clear field-level errors.
- What happens when a command author defines a schema with complex nested structures? Zod natively supports nested schemas, so nested validation errors should include the full path to the invalid field (e.g., `input.address.zipCode`).
- What happens when a command has a schema but no JSON input is provided (no --file, no stdin)? Input remains optional — validation is skipped and no `input` property is passed to the handler, preserving current behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Commands with JSON input MUST define a Zod schema that describes the valid input shape
- **FR-002**: The `input` property in command configuration MUST accept either a Zod schema (for validated input) or `true` (for backward-compatible unvalidated input)
- **FR-003**: When a Zod schema is provided, all JSON input MUST be validated against the schema before the handler is invoked
- **FR-004**: When validation fails, the CLI MUST print all validation errors with field paths and descriptions as plain text, then exit with a non-zero status
- **FR-005**: When validation succeeds, the handler MUST receive the Zod-parsed output (with transformations, defaults, and strong typing applied) rather than the raw `unknown` JSON
- **FR-006**: The `ParsedResult.input` type MUST reflect the schema's output type when a Zod schema is used, providing compile-time type safety to command handlers
- **FR-007**: Validation MUST occur after JSON parsing but before any handler logic executes
- **FR-008**: Commands using `input: true` (boolean) MUST continue to work without a schema, preserving backward compatibility
- **FR-009**: When a Zod schema is configured but no JSON input is provided (no --file, no stdin), validation MUST be skipped and the handler MUST receive no `input` property, preserving current optional-input behavior
- **FR-010**: When `--format=json` is active and validation fails, the CLI MUST print a structured JSON error to stdout (and nothing else) instead of plain text, then exit with a non-zero status

### Key Entities

- **Input Schema**: A Zod schema object associated with a command that describes the shape, types, and constraints of valid JSON input
- **Validation Result**: The outcome of running input through the Zod schema — either a strongly-typed parsed value or a structured set of validation errors
- **Parsed Input**: The Zod-processed output that replaces the raw `unknown` input, carrying full type information through to the handler

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of commands that accept JSON input have a schema definition that describes valid input
- **SC-002**: Users receive actionable error messages within 1 second when providing invalid input, without any handler side effects occurring
- **SC-003**: Command authors can define input schemas with zero additional boilerplate beyond the schema itself
- **SC-004**: LLM agents can self-correct invalid input on the first retry in 90%+ of cases based on the error messages provided

## Assumptions

- Zod v4 is already a project dependency and is the standard validation library for this project
- The existing `input: true` boolean configuration is in active use and must remain supported during a transition period
- Zod's `.parse()` method provides strongly-typed output (the inferred TypeScript type from the schema), which can replace the current `unknown` type on `ParsedResult.input`
- Zod's default behavior of stripping unrecognized keys is the desired behavior for extra properties in input JSON
- The error formatting approach should be consistent with existing CLI error output patterns (using Commander's `cmd.error()`) for the default text mode
- A global `--format=json` flag exists or will be introduced; when active, validation errors are emitted as structured JSON to stdout exclusively
