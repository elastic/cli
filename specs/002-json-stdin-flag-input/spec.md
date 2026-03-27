# Feature spec: JSON Input via Stdin and --file Flag

**Feature Branch**: `002-json-stdin-flag-input`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "all commands created by the factory function must support taking JSON as input from both stdin and --file flag. validation will be handled in a later spec, this just needs to add support for reading in JSON and passing the data to the command's handler."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pipe JSON from stdin (Priority: P1)

A user pipes a JSON payload into a factory-created command so that the command handler receives structured input data without requiring a file on disk.

**Why this priority**: Piping JSON via stdin is the primary way CLI tools are composed in scripts and pipelines. This is the core use case.

**Independent Test**: Run `echo '{"key":"value"}' | elastic <command>` and confirm the handler receives the JSON body.

**Acceptance Scenarios**:

1. **given** a valid JSON payload is piped to a factory-created command, **when** the command runs, **then** the handler receives the raw JSON body in its `RunContext`
2. **given** no data is piped and stdin is a TTY (interactive terminal), **when** the command runs, **then** the handler receives an empty/nil JSON body and the command succeeds without error
3. **given** stdin is empty (e.g. `echo "" | elastic <command>`), **when** the command runs, **then** the handler receives an empty/nil JSON body and the command succeeds without error

---

### User Story 2 - Pass JSON via --file flag (Priority: P2)

A user supplies the path to a JSON file using the `--file` flag so that the command handler receives the file's contents as structured input data.

**Why this priority**: The `--file` flag is a complement to stdin, enabling users to work with pre-existing files or to be explicit about the input source in scripts where stdin may be unavailable or inconvenient.

**Independent Test**: Run `elastic <command> --file ./payload.json` and confirm the handler receives the file's JSON body.

**Acceptance Scenarios**:

1. **given** a path to a readable JSON file is provided via `--file`, **when** the command runs, **then** the handler receives the file contents as the JSON body
2. **given** the path provided via `--file` does not exist, **when** the command runs, **then** the command exits with an error indicating the file was not found
3. **given** the path provided via `--file` is not readable (permissions), **when** the command runs, **then** the command exits with an error indicating the file could not be read

---

### User Story 3 - Error when both sources are provided (Priority: P3)

A user accidentally provides JSON via both stdin and `--file`. The command rejects the ambiguous input with a clear error rather than silently choosing one source.

**Why this priority**: Silently ignoring one of two provided inputs is a common source of hard-to-debug scripting errors. Failing loudly keeps behavior predictable and auditable.

**Independent Test**: Run `echo '{"stdin":"data"}' | elastic <command> --file payload.json` and confirm the command exits with an error before invoking the handler.

**Acceptance Scenarios**:

1. **given** JSON is provided via both stdin and `--file`, **when** the command runs, **then** the command exits with an error before invoking the handler
2. **given** JSON is provided via both stdin and `--file`, **when** the command runs, **then** the error message indicates that only one input source may be used at a time

---

### Edge Cases

- When a file path is provided via `--file` but the file is zero bytes, the handler receives a nil/zero-value body and the command succeeds without error — consistent with empty stdin behavior. Validation of empty input is deferred to a future spec.
- Stdin is considered active when it is not an interactive TTY (i.e., it is redirected or piped); this is the standard detection mechanism already stated in Assumptions.
- If `--file` is passed without a value, the flag parser rejects the invocation before the command runs — no special handling required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every command created by the factory function MUST accept an optional `--file` flag that takes a filesystem path as its value
- **FR-002**: Every command created by the factory function MUST read JSON from stdin when stdin is not an interactive TTY
- **FR-003**: The JSON body MUST be available to the command handler via `RunContext` as a `[]byte` field (nil when no input is provided). A future spec will handle transformation into typed structures via JSON schemas.
- **FR-004**: When both `--file` and piped stdin provide data simultaneously, the command MUST return an error before invoking the handler, indicating that only one input source may be used at a time
- **FR-005**: When no JSON is provided (no `--file` flag and stdin is a TTY or empty), OR when `--file` is provided but the file is zero bytes, the handler MUST receive a nil or zero-value JSON body and the command MUST succeed without error
- **FR-006**: When the path given to `--file` does not exist or cannot be read, the command MUST return an error before invoking the handler
- **FR-007**: The `--file` flag MUST be registered on every factory-created command without requiring each command definition to declare it manually

### Key Entities

- **JSON Body**: The raw JSON payload supplied by the user, sourced from stdin or a file. Carried in `RunContext` as a `[]byte` value — nil when absent, non-nil raw bytes otherwise. No parsing or schema enforcement is applied at this stage; a future spec will introduce JSON schema-based transformation into typed structures.
- **RunContext**: The per-invocation execution context passed to every command handler. Extended to carry the JSON body alongside existing fields (Config, ConfigPath, ActiveContext).
- **Factory Function**: The `factory.New(name, description, handler)` function that creates all CLI subcommands. Responsible for registering the `--file` flag and populating the JSON body in `RunContext` before calling the handler.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every existing and future factory-created command accepts JSON input via stdin without any additional per-command configuration
- **SC-002**: Every existing and future factory-created command accepts JSON input via `--file` without any additional per-command configuration
- **SC-003**: Command handlers always receive the JSON body through `RunContext` from exactly one source; ambiguous multi-source input is always rejected before the handler is called
- **SC-004**: Commands that receive no JSON input continue to run successfully and produce the same output as before this feature was added
- **SC-005**: A user who provides an invalid file path via `--file` receives a clear, actionable error message before any command logic executes

## Assumptions

- JSON input is stored as a raw `[]byte` at this stage; transformation into typed structures via JSON schemas is deferred to a future spec.
- An empty stdin (zero bytes) is treated equivalently to no JSON being provided, resulting in a nil/zero-value body rather than an error.
- Detection of an interactive TTY is the standard mechanism for deciding whether to read from stdin; if stdin is redirected or piped, the command will attempt to read it.
- The `--file` flag name is `--file` (not `--input`, `--body`, or similar); this can be revisited in a later spec if naming conventions emerge.
- Reading the full stdin payload into memory is acceptable for the scale of JSON payloads expected by this CLI.


## Clarifications

### Session 2026-03-26

- Q: When `--file` is provided but the file is zero bytes, what should happen? → A: Treat as nil body, succeed silently — consistent with empty stdin. Validation of empty input is deferred to a future spec.
- Q: What type should the JSON body field on `RunContext` be? → A: `[]byte` (nil when absent). JSON schema-based transformation into typed structures is deferred to a future spec.
- Q: When `--file` wins over stdin, should the command emit a runtime warning? → A: Neither — treat providing both as a user error; command returns an error before invoking the handler.