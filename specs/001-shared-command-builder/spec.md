# Feature spec: Shared Command Builder

**Feature Branch**: `001-shared-command-builder`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "CLI subcommands should be defined using a shared utility function that abstracts away the underlying tools used to build commands (commander, etc.). for now it should just handle argument parsing, but will be expanded to provide central support and enforcement for several features shared by all subcommands"

## Clarifications

### Session 2026-03-30

- Q: Should the builder validate/coerce argument and option values, or return raw strings? → A: The builder validates and coerces declared types (string, number, boolean) only; domain-specific validation is the command handler's responsibility.
- Q: How does the builder connect commands to their handler functions? → A: The builder accepts a handler callback in the command definition and invokes it with the typed parsed result, managing the full lifecycle (parse → validate → execute).
- Q: Should the builder support nested subcommands (command groups) or only flat commands? → A: Support nested subcommands (command groups like `elastic cluster health`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define a new subcommand using the shared builder (Priority: P1)

A developer adding a new CLI subcommand uses the shared command builder utility instead of directly importing and configuring the underlying argument parsing library. They declare the command's name, description, options, and handler callback through a single utility function call. The builder handles all interaction with the underlying parsing tool, validates and coerces types, and invokes the handler with the typed parsed result. Commands are identified by their name and position in the subcommand tree; all inputs beyond the command name are passed as named options or flags.

**Why this priority**: This is the core value proposition — providing a single, consistent way to define commands. Without this, the feature doesn't exist.

**Independent Test**: Can be fully tested by defining a simple command with options and a handler via the builder, invoking it with sample input, and verifying the handler receives correctly typed parsed values.

**Acceptance Scenarios**:

1. **given** a developer calls the shared builder with a command name, description, option definitions, and a handler callback, **when** the CLI is invoked with valid options, **then** the builder parses, validates, and invokes the handler with correctly typed option values
2. **given** a developer calls the shared builder with a required option, **when** the CLI is invoked without that option, **then** the builder produces a clear, user-friendly error message and the handler is never invoked
3. **given** a developer calls the shared builder, **when** they inspect the command definition code, **then** there are no direct imports or references to the underlying parsing library (e.g., Commander.js)
2. **given** a developer calls the shared builder with a required option, **when** the CLI is invoked without that option, **then** the builder produces a clear, user-friendly error message and the handler is never invoked
3. **given** a developer calls the shared builder, **when** they inspect the command definition code, **then** there are no direct imports or references to the underlying parsing library (e.g., Commander.js)

---

### User Story 2 - Define subcommand options and flags (Priority: P1)

A developer defines boolean flags and key-value options for a subcommand through the shared builder. The builder supports short and long option names, default values, and descriptions for help text generation.

**Why this priority**: Options and flags are fundamental to CLI commands; argument parsing without option support is incomplete.

**Independent Test**: Can be tested by defining a command with boolean flags and string/number options, invoking it with various combinations, and verifying correct parsing.

**Acceptance Scenarios**:

1. **given** a command defined with a boolean flag `--verbose` (short: `-v`), **when** the user invokes the command with `--verbose`, **then** the parsed result includes the flag set to true
2. **given** a command defined with an option `--output <path>` with a default value, **when** the user invokes the command without `--output`, **then** the parsed result includes the default value
3. **given** a command defined with a numeric option `--count <n>`, **when** the user provides a non-numeric value, **then** the builder produces a type coercion error before the handler is invoked
4. **given** a command defined with multiple options, **when** the user invokes `--help`, **then** all options are listed with their descriptions, types, and defaults

---

### User Story 3 - Define nested subcommands (command groups) (Priority: P2)

A developer organizes related subcommands into hierarchical groups using the shared builder (e.g., `elastic cluster health`, `elastic cluster stats`). The builder supports defining command groups that contain leaf commands, and groups can display their own help listing available sub-commands.

**Why this priority**: The CLI covers a large surface area (Elasticsearch, Cloud, Serverless APIs), making hierarchical grouping essential for discoverability and organization, but it builds on top of the core single-command builder.

**Independent Test**: Can be tested by defining a command group with two leaf commands, invoking each leaf command with valid input, and verifying the group's help text lists both sub-commands.

**Acceptance Scenarios**:

1. **given** a developer defines a command group `cluster` with leaf commands `health` and `stats`, **when** the user invokes `elastic cluster health`, **then** the `health` handler is invoked with the correct parsed arguments
2. **given** a command group `cluster` is defined, **when** the user invokes `elastic cluster` without a sub-command, **then** the CLI displays help text listing all available sub-commands in the group
3. **given** a command group `cluster` with leaf command `health`, **when** the user invokes `elastic cluster health --help`, **then** help text specific to the `health` command is displayed

---

### User Story 4 - Consistent help text generation (Priority: P2)

When a user invokes any subcommand with `--help` or provides invalid input, the CLI displays consistently formatted help text and error messages regardless of which subcommand is being used. The shared builder enforces this uniformity.

**Why this priority**: Help text consistency improves usability for both human and agent users, but is secondary to core argument parsing functionality.

**Independent Test**: Can be tested by defining two different commands via the builder and verifying that help output follows the same format and structure.

**Acceptance Scenarios**:

1. **given** two subcommands defined via the shared builder, **when** each is invoked with `--help`, **then** both display help text in the same consistent format
2. **given** a subcommand invoked with an unrecognized option, **when** the error is displayed, **then** the error message follows a consistent format and suggests valid alternatives or shows usage

---

### User Story 5 - Extensibility for future shared features (Priority: P3)

The shared builder's design allows for future additions of cross-cutting concerns (e.g., output formatting, authentication, logging) without requiring changes to existing command definitions. The builder acts as a central point of control for all subcommands.

**Why this priority**: This is a forward-looking architectural concern. It doesn't deliver immediate user value but ensures the builder can grow without breaking existing commands.

**Independent Test**: Can be validated by reviewing the builder's interface to confirm that adding new shared behaviors would not require modifications to existing command definitions.

**Acceptance Scenarios**:

1. **given** the shared builder's interface, **when** a new cross-cutting feature is conceptualized (e.g., global output format flag), **then** the builder's design supports adding it without modifying existing command definitions

---

### Edge Cases

- How does the system handle conflicting option names across subcommands sharing the same parent?
- What happens when a command is defined with no options — does the builder still function correctly?
- What happens when the same option is specified multiple times on the command line?
- What happens when a numeric option receives a value that is technically a number but nonsensical (e.g., negative count, NaN, Infinity)?
- What happens when the handler callback throws an error — does the builder catch it or let it propagate?
- What happens when a command group is defined with no leaf commands?
- What happens when a user invokes a deeply nested path that doesn't match any command (e.g., `elastic cluster nonexistent`)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single utility function (or small set of functions) for defining CLI subcommands
- **FR-002**: The system MUST accept a command name, description, option definitions, and a handler callback as input to the builder
- **FR-003**: ~~removed~~ *(positional argument support is out of scope; commands are identified solely by name in the subcommand tree)*
- **FR-004**: The system MUST parse named options (both long `--name` and short `-n` forms) from user input
- **FR-005**: ~~removed~~ *(positional arguments are not supported; required/optional validation applies to named options only, covered by FR-006 and FR-007)*
- **FR-006**: The system MUST support boolean flags, string options, and numeric options with optional default values
- **FR-007**: The system MUST validate and coerce option values to their declared types (string, number, boolean); values that cannot be coerced MUST produce a clear error before the command handler is invoked
- **FR-008**: The system MUST NOT perform domain-specific validation (e.g., valid file paths, allowed enum values) — that responsibility belongs to individual command handlers
- **FR-009**: The system MUST invoke the handler callback with the fully typed parsed result after successful parsing and validation
- **FR-010**: The system MUST support nested subcommands (command groups) allowing hierarchical organization of commands (e.g., `elastic cluster health`)
- **FR-011**: The system MUST display a list of available sub-commands when a command group is invoked without specifying a leaf command
- **FR-012**: The system MUST generate help text automatically from the command definition, displaying usage and options
- **FR-013**: The system MUST NOT expose the underlying argument parsing library's API to command authors — the builder is the only interface
- **FR-014**: The system MUST produce user-friendly, consistently formatted error messages for invalid input
- **FR-015**: The system MUST be designed to allow future addition of shared cross-cutting features without breaking changes to existing command definitions

### Key Entities

- **Command Definition**: Represents the declarative configuration of a subcommand — its name, description, options, and handler callback
- **Command Group**: A non-leaf command that contains one or more child commands (leaf or nested groups), providing hierarchical organization
- **Option**: A named input parameter with long name, optional short name, value type (string, number, or boolean), description, required/optional status, and optional default value
- **Parsed Result**: The structured output of option parsing for a given invocation, with values coerced to their declared types
- **Handler Callback**: The function provided by the command author that receives the typed parsed result and implements the command's behavior

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All new CLI subcommands can be fully defined using only the shared builder — no direct use of the underlying parsing library is required
- **SC-002**: A developer can define a new subcommand with options and a handler in a single function call, reducing boilerplate compared to direct library usage
- **SC-003**: Help text output is consistent in format and structure across 100% of subcommands defined via the builder
- **SC-004**: 100% of invalid input scenarios produce a clear, actionable error message without exposing internal implementation details
- **SC-005**: Adding a new shared feature to all subcommands requires changes only to the builder, not to individual command definitions
- **SC-006**: 100% of type coercion errors (e.g., non-numeric value for a numeric option) are caught by the builder before the command handler executes
- **SC-007**: Commands can be organized into groups at least 2 levels deep (e.g., `elastic <group> <command>`)

## Assumptions

- The CLI already uses Commander.js or a similar library for argument parsing; the builder wraps this library rather than replacing it
- The builder will initially focus on argument parsing only, with other shared features (output formatting, auth, logging, etc.) added in future iterations
- Subcommands are registered as part of a parent CLI application; the builder integrates with the existing registration mechanism
- The builder targets both human users and LLM-powered agents as consumers of the CLI, so machine-friendly output and clear error messages are priorities
