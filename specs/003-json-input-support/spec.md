# Feature spec: JSON Input Support

**Feature Branch**: `003-json-input-support`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "All commands that take input must support taking JSON as input, either via an argument (e.g. --file path/to/file.json) or via stdin. To do this, the factory should check for either, and add it to the context that is passed to the command handler function. Defining what a valid JSON input will be for a command will be handled later."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provide JSON Input via File Argument (Priority: P1)

A user (human or LLM agent) wants to pass structured JSON data to a CLI command by referencing a file on disk. They invoke a command with `--file path/to/data.json`, and the CLI reads, parses, and makes the JSON content available to the command handler through its context.

**Why this priority**: File-based input is the most common and ergonomic way to pass structured data to CLI commands, especially for repeatable workflows and scripted automation.

**Independent Test**: Can be tested by invoking any input-accepting command with `--file` pointing to a valid JSON file and verifying the parsed data appears in the handler context.

**Acceptance Scenarios**:

1. **given** a command that accepts input and a valid JSON file exists on disk, **when** the user passes `--file path/to/file.json`, **then** the command handler receives the parsed JSON object in its context
2. **given** a command that accepts input and the specified file does not exist, **when** the user passes `--file nonexistent.json`, **then** the CLI exits with a clear error message indicating the file was not found
3. **given** a command that accepts input and the file contains malformed JSON, **when** the user passes `--file bad.json`, **then** the CLI exits with a clear error message indicating the JSON could not be parsed

---

### User Story 2 - Provide JSON Input via Stdin (Priority: P1)

A user (human or LLM agent) wants to pipe JSON data into a CLI command via stdin, enabling composable shell pipelines (e.g., `cat data.json | elastic command` or `echo '{"key":"value"}' | elastic command`).

**Why this priority**: Stdin support is essential for agent-driven workflows and shell pipeline composition, which are first-class use cases for this CLI.

**Independent Test**: Can be tested by piping valid JSON to a command via stdin and verifying the parsed data appears in the handler context.

**Acceptance Scenarios**:

1. **given** a command that accepts input and JSON is piped to stdin, **when** the command runs, **then** the command handler receives the parsed JSON object in its context
2. **given** a command that accepts input and malformed JSON is piped to stdin, **when** the command runs, **then** the CLI exits with a clear error message indicating the JSON could not be parsed
3. **given** a command that accepts input and stdin is empty (no pipe, interactive terminal), **when** the command runs without `--file`, **then** the command proceeds without JSON input in the context (input is always optional at the factory level)

---

### User Story 3 - Factory Automatically Wires JSON Input for Commands (Priority: P1)

A developer defining a new command via the factory wants JSON input support to be handled automatically. When a command is defined as accepting input, the factory adds the `--file` option and stdin detection without the developer writing any custom input-handling logic.

**Why this priority**: This ensures consistency across all commands and reduces boilerplate, which is core to the CLI's architecture philosophy of shared, reusable config structures.

**Independent Test**: Can be tested by defining a command through the factory with input support enabled and verifying that `--file` option and stdin parsing are automatically available.

**Acceptance Scenarios**:

1. **given** a command is defined via the factory with input support enabled, **when** the command is registered, **then** the `--file` option is automatically added to the command
2. **given** a command is defined via the factory without input support enabled, **when** the command is registered, **then** no `--file` option is added and no stdin reading occurs

---

### User Story 4 - Conflict Resolution Between File and Stdin (Priority: P2)

A user accidentally provides JSON input via both `--file` and stdin simultaneously. The CLI must handle this unambiguously.

**Why this priority**: Preventing ambiguous input is important for reliability, but this is an edge case that occurs less frequently than the primary input paths.

**Independent Test**: Can be tested by piping JSON to stdin while also passing `--file` and verifying the CLI responds with a clear, deterministic outcome.

**Acceptance Scenarios**:

1. **given** a command that accepts input, **when** both `--file` and stdin are provided, **then** the CLI exits with a clear error message indicating that only one input source is allowed

---

### Edge Cases

- What happens when the file path contains spaces or special characters?
- What happens when stdin receives an extremely large JSON payload?
- What happens when the JSON file is empty (0 bytes)? → Empty content (0 bytes) from either `--file` or stdin is treated as a JSON parse error, not as absent input
- What happens when `--file` is passed with no value?
- What happens when stdin contains valid JSON followed by trailing content?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The command factory MUST support a single boolean `input` flag in `CommandConfig` to enable JSON input for a command. Input is always optional at the factory level; commands that need to enforce required input do so in their own handler. (This will evolve when JSON input validation support is added in a later spec.)
- **FR-002**: When JSON input is enabled, the factory MUST automatically add a `--file <path>` option to the command
- **FR-003**: When JSON input is enabled, the factory MUST automatically check stdin for piped JSON data
- **FR-004**: The factory MUST parse the JSON from the selected input source and add the result to the context object passed to the command handler
- **FR-005**: If `--file` is provided, the factory MUST read and parse the file at the given path
- **FR-006**: If `--file` is not provided and stdin is not a TTY (i.e., data is being piped), the factory MUST read and parse stdin as JSON
- **FR-007**: If both `--file` and stdin are provided, the factory MUST exit with an error indicating only one input source is allowed
- **FR-008**: If the file specified by `--file` does not exist, the factory MUST exit with a descriptive error
- **FR-009**: If the JSON from any source is malformed, the factory MUST exit with a descriptive parse error
- **FR-010**: If neither `--file` nor stdin is provided, the context MUST contain no JSON input (the field should be absent or undefined)
- **FR-011**: JSON schema validation of the input content is explicitly out of scope for this feature and will be handled separately
- **FR-012**: When `input` is enabled, the factory MUST validate at definition time that no user-defined option in the command's `options` array uses the `--file` long name, and error if a collision is detected
- **FR-013**: Empty content (0 bytes) from either `--file` or stdin MUST be treated as a JSON parse error, not as absent input

### Key Entities

- **JSON Input**: The raw JSON data provided by the user, parsed into a JavaScript object. Passed through the command context to the handler.
- **Command Context**: The object passed to every command handler function. Will be extended with an optional field containing the parsed JSON input.
- **Command Configuration**: The existing `CommandConfig` interface used by the factory. Will be extended with a flag to enable JSON input support.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any command with input support enabled can receive JSON data via `--file` and the handler receives the parsed content
- **SC-002**: Any command with input support enabled can receive JSON data via stdin pipe and the handler receives the parsed content
- **SC-003**: Users receive clear, actionable error messages for all failure modes (missing file, bad JSON, dual input)
- **SC-004**: Defining a command with JSON input support requires no custom input-handling code from the developer — only a configuration flag
- **SC-005**: Commands without input support enabled are completely unaffected by this feature

## Assumptions

- The `--file` option name is reserved by the factory for JSON input; the factory validates against collisions at definition time
- JSON is the only structured input format needed at this time (no YAML, TOML, etc.)
- Stdin detection uses TTY check (`process.stdin.isTTY`) to determine if data is being piped
- The parsed JSON is stored as a plain JavaScript object; no transformation or normalization is applied
- There is no maximum file size enforced at this stage; OS and memory limits apply naturally
- The context field name for JSON input will follow the project's existing naming conventions
- The input optionality model (always optional at factory level) is intentionally minimal and will be revisited when JSON input validation support is added in a future spec

## Clarifications

### Session 2026-03-31

- Q: Can a command declare JSON input as required, or is it always optional when enabled? → A: Single `input` flag enables support; input is always optional at the factory level. Commands enforce required-ness themselves. This will change in a later spec when JSON input validation support is added.
- Q: How should empty file (0 bytes) or empty stdin be handled? → A: Treat empty content as a JSON parse error. An empty string is not valid JSON, and silently treating it as "no input" could mask user mistakes.
- Q: Should the factory detect `--file` option name collisions at definition time? → A: Yes, the factory validates at definition time that no user-defined option collides with `--file` when `input: true`.