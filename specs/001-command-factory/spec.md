# Feature spec: Command Factory with Config Loading

**Feature Branch**: `001-command-factory`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "I need to build a command factory utility that is used to define every CLI subcommand. It will be responsible for enforcing technical requirements for each subcommand, like requiring JSON as input and output, loading context from the config and any global arguments, support for pre-run validation, --dry-run, etc. I don't want to build all of that now, just the ability to load config from a ~/.config/elastic/config.yml file (or the OS-specific variety of that path), but it should be written in such a way that extending it to support more of those requirements will be straightforward."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define a new CLI subcommand using the factory (Priority: P1)

A CLI developer creates a new subcommand by providing the factory with a command definition (name, description, and a run handler). The factory produces a fully wired command that automatically loads user configuration from the standard config file location before the handler executes. The developer does not need to know where the config file lives or how it is parsed — the factory handles that transparently.

**Why this priority**: This is the core value proposition — a single, consistent entry point for defining every subcommand. Without this, the factory has no reason to exist.

**Independent Test**: Can be tested by defining a minimal subcommand via the factory and verifying that (a) the command is callable, (b) the config is loaded and available to the handler, and (c) the developer only had to supply the command name, description, and handler logic.

**Acceptance Scenarios**:

1. **given** a developer provides a command name, description, and handler to the factory, **when** the factory produces the command, **then** the command is executable and the handler receives the loaded configuration context.
2. **given** a valid config file exists at the OS-appropriate path, **when** the factory-produced command runs, **then** the configuration values are available to the handler before it executes.
3. **given** multiple subcommands are defined through the factory, **when** each subcommand runs, **then** each receives the same configuration loaded from the same source.

---

### User Story 2 - CLI works gracefully when no config file exists (Priority: P1)

A user runs a CLI command for the first time on a fresh machine where no config file has been created. The command still executes successfully using sensible defaults rather than crashing or producing a confusing error.

**Why this priority**: First-run experience is critical. Users should not be required to create a config file before they can use the CLI at all.

**Independent Test**: Can be tested by running a factory-produced command with no config file present and verifying the command completes without error and uses default values.

**Acceptance Scenarios**:

1. **given** no config file exists at the expected path, **when** a factory-produced command runs, **then** the command executes successfully with default configuration values.
2. **given** no config file exists, **when** the handler inspects the configuration, **then** all configuration fields have documented default values.

---

### User Story 3 - User customizes CLI behavior via config file (Priority: P2)

A user creates or edits the config file at the standard location to set values (such as a default Elasticsearch endpoint or default output preferences). When they next run a CLI command, those values are picked up automatically.

**Why this priority**: Config file support is the primary feature being built in this phase. It must work reliably for the factory to be useful.

**Independent Test**: Can be tested by writing a config file with known values, running a factory-produced command, and verifying the handler sees those values.

**Acceptance Scenarios**:

1. **given** a config file with custom values exists, **when** a factory-produced command runs, **then** the handler receives those custom values in its configuration context.
2. **given** a config file sets only some values, **when** a factory-produced command runs, **then** unset values fall back to defaults while set values are respected.

---

### User Story 4 - Factory design supports future extensibility (Priority: P2)

A CLI developer needs to add a new cross-cutting concern to all commands in the future (such as JSON-only output enforcement, --dry-run support, or pre-run validation). They can do so by modifying the factory in one place without changing every existing subcommand definition.

**Why this priority**: The factory pattern only pays off if future capabilities can be added centrally. This story validates the architecture even though the extensions are not built yet.

**Independent Test**: Can be validated by inspecting the factory's design and confirming that new behaviors can be injected without modifying existing command definitions. A developer should be able to add a new pre-run hook or output constraint without touching any previously defined subcommand.

**Acceptance Scenarios**:

1. **given** the factory exists with config-loading capability, **when** a developer reviews the factory's structure, **then** there is a clear, documented extension point for adding new cross-cutting behaviors.
2. **given** a new cross-cutting behavior is added to the factory, **when** existing subcommands are run, **then** they automatically gain the new behavior without code changes to their definitions.

---

### Edge Cases

- What happens when the config file exists but is empty? The system should treat it as valid and use all default values.
- What happens when the config file contains malformed content? The system should report a clear, actionable error message indicating the file path and the nature of the parsing problem.
- What happens when the config file has unexpected or unrecognized fields? The system should ignore unrecognized fields and load only known configuration values without error.
- What happens when the config file has incorrect permissions (unreadable)? The system should report a clear error indicating the file exists but cannot be read.
- What happens when the OS-specific config directory does not exist? The system should treat this the same as a missing config file — use defaults.
- What happens when `$ELASTIC_CONFIG` points to a non-existent file? The system MUST return a hard error indicating the explicitly set path was not found — no silent fallback to defaults. This distinguishes a deliberate (but broken) override from an absent config file.
- What happens when `$ELASTIC_CONFIG` points to an unreadable or malformed file? Apply the same error reporting as for any unreadable or malformed config file.
- What happens when `--context=foo` names a context that does not exist in the config file? The system MUST return a hard error naming the missing context and listing available contexts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a factory function that accepts a command definition (name, description, and a `RunFunc` handler) and produces a fully configured CLI command.
- **FR-001a**: The handler MUST use the signature `type RunFunc func(ctx RunContext) error`, where `RunContext` is a struct provided by the factory carrying `Config` (the full loaded configuration), `ConfigPath` (the resolved file path, empty string if defaults used), `ActiveContext` (the resolved context name — from `--context` flag or `current_context`), and any future cross-cutting fields.
- **FR-002**: The system MUST automatically load configuration from a YAML file at the resolved config path: on Linux and macOS, `$XDG_CONFIG_HOME/elastic/config.yml` if `$XDG_CONFIG_HOME` is set and non-empty, otherwise `~/.config/elastic/config.yml`; on Windows, `%APPDATA%\elastic\config.yml`.
- **FR-003**: The system MUST populate `RunContext.Config` with the loaded configuration and `RunContext.ConfigPath` with the resolved file path before the handler executes. `ConfigPath` MUST be an empty string when no config file was found and defaults are in use.
- **FR-004**: The system MUST use sensible default values when no config file exists.
- **FR-005**: The system MUST use sensible default values for any configuration fields not present in the config file.
- **FR-006**: The system MUST return a descriptive Go `error` when the config file exists but cannot be parsed (malformed content). The error message MUST include the file path and a human-readable description of the parse problem. The Cobra root command is responsible for writing this error to `stderr` and exiting with a non-zero code.
- **FR-007**: The system MUST return a descriptive Go `error` when the config file exists but cannot be read (e.g., permission denied). The Cobra root command is responsible for writing this error to `stderr` and exiting with a non-zero code.
- **FR-008**: The system MUST silently ignore unrecognized fields in the config file.
- **FR-009**: The factory MUST use `RunContext` as the primary extension mechanism — new cross-cutting concerns (JSON I/O enforcement, --dry-run, pre-run validation, global arguments) are added as new fields on `RunContext`, allowing existing handlers to remain unchanged.
- **FR-010**: All factory-produced commands MUST behave consistently — every command goes through the same initialization pipeline.
- **FR-011**: The system MUST support an `$ELASTIC_CONFIG` environment variable that, when set, overrides all path resolution logic and loads configuration from the specified file path directly. This variable takes precedence over `$XDG_CONFIG_HOME` and OS defaults. If `$ELASTIC_CONFIG` is set but the referenced file does not exist, the system MUST return a hard error (not fall back to defaults).
- **FR-012**: The root command MUST register a persistent `--context=<name>` flag. When provided, it overrides `current_context` from the config file for that invocation only. The resolved context name MUST be available in `RunContext` before the handler executes.

### Key Entities

- **Command Definition**: the inputs a developer provides to the factory — command name, description, and a `RunFunc` handler. This is the minimal contract between a subcommand author and the factory.
- **RunFunc**: the handler function type — `type RunFunc func(ctx RunContext) error`. Every subcommand implements this signature.
- **RunContext**: a struct populated by the factory before each command execution. Fields: `Config` (full loaded configuration), `ConfigPath` (resolved path of loaded file, empty string if defaults used), `ActiveContext` (resolved context name — from `--context` flag if set, else `Config.CurrentContext`). Designed to accommodate future cross-cutting fields (e.g., dry-run flag, validated input) without changing existing handler signatures.
- **Configuration** (`Config`): the user-facing settings loaded from the config file. Defined and owned by the factory package — a single shared struct used by all subcommands. Represents the user's environment preferences (e.g., default endpoint, output preferences). Has a defined schema of known fields, each with a default value. The schema is not caller-configurable; all subcommands share the same `Config` type.
- **Factory**: the central builder that takes a Command Definition, wires in cross-cutting concerns (starting with config loading), and produces a runnable CLI command.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of CLI subcommands are defined through the factory — no subcommand bypasses it.
- **SC-002**: A new subcommand can be defined in 5 lines or fewer of command-specific code (name, description, handler), with all infrastructure handled by the factory.
- **SC-003**: A user with no config file can run any command successfully on first use with zero setup steps.
- **SC-004**: A user's custom config values are reflected in command behavior within one command invocation after editing the config file (no restart, cache flush, or re-login required).
- **SC-005**: Adding a new cross-cutting concern to the factory requires changes in only one location and automatically applies to all existing commands without modifying their definitions.
- **SC-006**: Config file parse errors produce an error message that includes the file path and a human-readable description of the problem, enabling the user to fix the issue without searching documentation.

## Assumptions

- The config file format is YAML, consistent with the user's description of `config.yml`.
- The OS-appropriate config path on Linux and macOS follows XDG: `$XDG_CONFIG_HOME/elastic/config.yml` when `$XDG_CONFIG_HOME` is set, otherwise `~/.config/elastic/config.yml`. On Windows: `%APPDATA%\elastic\config.yml`. This matches the behavior of developer CLI tools such as `gh` and `helm`.
- The initial config schema is minimal (likely just a default Elasticsearch endpoint and basic preferences) and will grow over time.
- The `Config` struct is defined and owned by the factory package. It is not generic or caller-provided — all subcommands share the same type. Schema changes are made in one place.
- The CLI already has or will have a root command structure; the factory integrates with the existing command hierarchy rather than replacing it.
- "Sensible defaults" means the CLI is fully functional against a local or well-known endpoint without any configuration — the exact defaults will be determined during planning.
- Automated CI runs on Linux only. macOS path behavior (XDG fallback, home directory resolution) is verified manually. Windows is best-effort with no CI gate.

## Scope

### In Scope (this phase)

- Factory function that accepts command definitions and produces configured commands
- Config file loading from OS-appropriate path
- Default values when config is missing or incomplete
- Error handling for malformed or unreadable config files
- Extension-friendly architecture
- `$ELASTIC_CONFIG` environment variable override for the config file path (takes precedence over `$XDG_CONFIG_HOME` and OS defaults; enables test fixture setup across all platforms)
- `--context=<name>` persistent global flag on the root command for per-invocation context override
- Windows config path (`%APPDATA%\elastic\config.yml`) implemented correctly; Windows CI verification is best-effort and not required to gate this phase

### Out of Scope (future phases)

- JSON input/output enforcement
- `--dry-run` flag support
- Pre-run validation hooks
- Global argument handling (except `--context`, which is in scope as the context-selection flag)
- Config file creation/initialization commands
- Config file migration between schema versions
- Environment variable overrides for config *values* (distinct from `$ELASTIC_CONFIG` path override, which is in scope)
- Command-line flag overrides for config values


## Clarifications

### Session 2026-03-26

- Q: On macOS, which config path convention should the factory use? → A: `~/.config/elastic/config.yml` (XDG-style, same as Linux; consistent with developer CLI tools like `gh` and `helm`)
- Q: What level of Windows support is required in this phase? → A: Best-effort — Windows code path (`%APPDATA%\elastic\config.yml`) implemented, but no Windows CI runner required this phase; Linux is the first-class CI target; macOS is verified manually or out-of-band.
- Q: Should `$XDG_CONFIG_HOME` be respected on Linux and macOS? → A: Yes — use `$XDG_CONFIG_HOME/elastic/config.yml` when set and non-empty, fall back to `~/.config/elastic/config.yml`.
- Q: Which OS platforms must be verified in automated CI? → A: Linux only; macOS verified manually or out-of-band; Windows best-effort with no CI gate.
- Q: Should a `$ELASTIC_CONFIG` env var for full config path override be in scope? → A: Yes — in scope this phase; takes precedence over `$XDG_CONFIG_HOME` and OS defaults; enables cross-OS test fixture setup.
- Q: What function signature should the command handler use? → A: Custom `type RunFunc func(ctx RunContext) error` — `RunContext` carries `Config` now and future cross-cutting fields non-breakingly (FR-009 extension mechanism).
- Q: When `$ELASTIC_CONFIG` is set but points to a non-existent file, should the system error or use defaults? → A: Hard error — explicit path override that is missing indicates misconfiguration; no silent fallback.
- Q: Does the factory own the `Config` type, or is it caller-provided/generic? → A: Factory owns it — single shared `Config` struct in the factory package; all subcommands use the same type; no Go generics required.
- Q: How should config-loading errors be surfaced — direct stderr+exit or returned Go error? → A: Return Go `error` from the factory pipeline; Cobra root command handles `stderr` output and non-zero exit. Keeps factory code testable and I/O-free.
- Q: Should `RunContext` expose the resolved config file path alongside `Config` values? → A: Yes — add `ConfigPath string` field; empty string when defaults are used; enables diagnostic output and clean test assertions.
- Q (plan input): Should --context=<name> be a global flag in this phase? → A: Yes — persistent flag on root command; overrides current_context for one invocation; resolved name exposed as RunContext.ActiveContext.
