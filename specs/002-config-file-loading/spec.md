# Feature spec: Configuration File Loading

**Feature Branch**: `002-config-file-loading`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Configuration for the CLI will live in a YAML file in multiple possible locations. It will have several contexts, each of which stores configurations and auth information for different APIs. There is also a 'selected context' option, which sets what context to look at by default. This closely follows the pattern used by tools like kubectl. The scope of this spec is to 1) find the correct config file 2) parse and validate its contents against a config spec 3) deserialize the config data into a typed version of the config's values 4) pass the deserialized object to the command's handler function. Most values in the config will be passed along to the handler as-is, but some values may be calculated. For instance, the handler should just get a context value that includes the selected context's config values; it should not see any other contexts other than the selected one. So the config builder needs to be able to do both type coercion and calculated values."

## Clarifications

### Session 2026-03-30

- Q: Can a user override the active context per-command via a CLI flag (e.g., `--context staging`), or is the `current-context` field in the config file the only way to select a context? → A: Runtime context override via CLI flag is in scope for this feature.
- Q: Can a user override the config file path per-command via a CLI flag (e.g., `--config /path/to/file.yml`), or is config discovery always automatic? → A: Config file path override via CLI flag is in scope for this feature.
- Q: How should the system handle unknown/extra fields in the config file that are not defined in the schema? → A: Silently ignore unknown fields (forward-compatible, kubectl-style).
- Q: What authentication credential types must a context support? → A: API key and username/password.
- Q: When the config file is valid YAML but empty, what should happen? → A: Treat as a validation error (missing required fields).
- Q: Does each service within a context have its own endpoint URL in addition to its own auth credentials? → A: Yes, each service stores both endpoint/host and auth credentials.
- Q: Does the command handler receive the entire active context (all service blocks), or only the service relevant to the command? → A: Handler receives the full active context with all configured service blocks.
- Q: Is the set of service types fixed at compile time, or extensible at runtime? → A: Fixed at compile time; new service types require a code change.

## User Scenarios & Testing

### User Story 1 - Load configuration and resolve the active context (Priority: P1)

A CLI user runs any command. The system locates the configuration file from a set of well-known locations (or from a path specified via a `--config` CLI flag), reads it, validates it against the configuration schema, resolves the selected context, and passes a typed configuration object — containing only the active context's values — to the command handler. The active context is determined by the `current-context` field in the config file, but can be overridden per-command via a CLI flag (e.g., `--context staging`).

**Why this priority**: This is the core workflow. Without config loading and context resolution, no command can authenticate or reach the correct API endpoint.

**Independent Test**: Can be tested by creating a valid config file in a supported location, running a command, and verifying the handler receives the correct context values.

**Acceptance Scenarios**:

1. Given a valid config file exists in one of the supported locations, when a user runs a command, then the system finds the file, parses it, validates it, resolves the selected context, and the command handler receives a typed config object containing only the active context's values.
2. Given config files exist in multiple supported locations, when a user runs a command, then the system uses the file with the highest precedence.
3. Given the config file contains a `current-context` field set to a named context, when the config is loaded, then the handler receives that context's values under a single `context` property without any other contexts visible.
4. Given a user passes a `--context` CLI flag, when the config is loaded, then the flag value overrides the `current-context` field and the handler receives the CLI-specified context's values.
5. Given a user passes a `--config` CLI flag with a file path, when the config is loaded, then the system uses that file instead of searching well-known locations.

---

### User Story 2 - Validate and reject an invalid configuration file (Priority: P1)

A CLI user has a malformed or incomplete config file. When they run a command, the system detects the validation errors and reports them clearly so the user knows what to fix.

**Why this priority**: Invalid config must be caught early with clear feedback; silently using bad config leads to confusing downstream errors.

**Independent Test**: Can be tested by providing a config file with missing required fields or invalid values, running a command, and verifying the system produces a clear, actionable error message.

**Acceptance Scenarios**:

1. Given a config file with missing required fields, when the system loads it, then it reports which fields are missing and does not proceed to the command handler.
2. Given a config file with values of the wrong type, when the system loads it, then it reports the type mismatch with the field name and expected type.
3. Given the selected context name (whether from `current-context` or `--context` flag) does not match any defined context, when the system loads the config, then it reports that the context was not found.

---

### User Story 3 - Handle missing configuration gracefully (Priority: P2)

A CLI user runs a command but no configuration file exists in any of the supported locations. The system reports a clear error indicating that no config file was found and suggests where to create one.

**Why this priority**: A helpful missing-config message is important for onboarding but is secondary to core loading and validation.

**Independent Test**: Can be tested by ensuring no config file exists in any supported location, running a command, and verifying the error message names the expected file locations.

**Acceptance Scenarios**:

1. Given no config file exists in any supported location, when a user runs a command, then the system reports that no configuration file was found and lists the locations it searched.

---

### User Story 4 - Computed and coerced configuration values (Priority: P2)

Some configuration values need transformation before reaching the command handler. The config builder coerces raw string values to their target types (e.g., string "443" to number 443) and computes derived values (e.g., merging the selected context into a flat `context` property). The handler receives only the final, ready-to-use typed object.

**Why this priority**: Coercion and computed values keep command handlers simple and free from config-parsing logic, but this builds on top of the core loading story.

**Independent Test**: Can be tested by providing a config file with string-encoded numbers or other coercible values, loading the config, and verifying the handler receives correctly typed and computed values.

**Acceptance Scenarios**:

1. Given a config value that is a numeric string, when the config is loaded, then the handler receives it as the correct numeric type.
2. Given a config with multiple contexts and a selected context, when the config is loaded, then the handler receives a single `context` object containing the selected context's merged values and no reference to other contexts.

---

### Edge Cases

- An empty config file (valid YAML but no fields) is treated as a validation error: required fields like `current-context` and `contexts` are missing, producing the standard validation error message.
- Unknown/extra fields not in the schema are silently ignored (forward-compatible).
- What happens when the selected context references a context that was deleted or renamed?
- What happens when a context is configured but none of its service blocks have valid auth fields?
- What happens when a command requires a specific service type that is not configured in the active context?
- What happens when the config file has a syntax error (invalid YAML)?
- What happens when the config file exists but is not readable (permissions issue)?
- What happens when the `--context` flag names a context that does not exist in the config file?

## Requirements

### Functional Requirements

- **FR-001**: System MUST search for the configuration file in a defined set of locations with a clear precedence order (e.g., project directory, user home directory, system-wide directory). A `--config` CLI flag MUST override this search and use the specified file path directly.
- **FR-002**: System MUST parse the configuration file as YAML.
- **FR-003**: System MUST validate the parsed configuration against a defined schema, rejecting files that do not conform. Unknown fields not defined in the schema MUST be silently ignored (forward-compatible).
- **FR-004**: System MUST support multiple named contexts within a single configuration file. Each context contains one or more service blocks from a defined set of service types: `elasticsearch`, `kibana`, and `cloud`. Each service block stores its own endpoint/host and authentication credentials (API key or username/password).
- **FR-004a**: A context MUST contain at least one configured service. A context does not need to have all service types configured.
- **FR-005**: System MUST support a `current-context` field (or equivalent) that identifies which context is active by default.
- **FR-006**: System MUST resolve the active context and present it to the command handler as a single `context` value containing all of the context's configured service blocks, excluding all other contexts.
- **FR-007**: System MUST coerce configuration values to their expected types as defined by the schema (e.g., string to number).
- **FR-008**: System MUST support computed/derived configuration values that are calculated from raw config data before being passed to the handler.
- **FR-009**: System MUST produce clear, actionable error messages when the config file is missing, malformed, or fails validation.
- **FR-010**: System MUST pass the fully resolved, typed configuration object to the command handler function.
- **FR-011**: System MUST accept a `--context` CLI flag that overrides the `current-context` field from the config file for a single command invocation. The flag takes precedence over the file-based default.
- **FR-012**: System MUST accept a `--config` CLI flag that specifies an explicit config file path, bypassing the default location search. If the specified file does not exist or is unreadable, the system MUST report a clear error.

### Key Entities

- **Configuration File**: The YAML file containing all contexts and the selected-context pointer. Located via a precedence-based search of well-known paths, or specified explicitly via the `--config` CLI flag.
- **Context**: A named group of service configurations within the configuration file. Each context contains one or more service blocks (from the set: `elasticsearch`, `kibana`, `cloud`). At least one service must be configured per context.
- **Service Block**: A service-specific configuration within a context, storing the endpoint/host URL and authentication credentials (API key or username/password) for that service. Each service block has its own independent auth configuration.
- **Current Context (Selected Context)**: A pointer (by name) to the context that should be used by default when no override is specified. Can be overridden per-command via the `--context` CLI flag.
- **Resolved Config Object**: The final typed object passed to command handlers, containing the active context's full set of configured service blocks and any computed values. No other contexts are visible.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Commands receive a fully typed configuration object on every invocation when a valid config file is present.
- **SC-002**: Users receive a clear, actionable error message within 1 second when the configuration file is missing, malformed, or invalid.
- **SC-003**: The command handler never sees raw, unvalidated, or untyped configuration data.
- **SC-004**: Users can switch between contexts by changing a single field in the config file or by passing a `--context` flag, and immediately see the new context used on the next command invocation.
- **SC-005**: Configuration file discovery, parsing, validation, and context resolution complete in under 100 milliseconds for typical config files.

## Assumptions

- The configuration file format is YAML, consistent with the project's use of YAML-based configuration.
- File search precedence follows the common CLI convention: current working directory or project root → user home directory (e.g., `~/.elastic/cli.yml`) → system-wide location. The exact paths will be determined during planning.
- Extra/unknown fields in the config file are silently ignored for forward-compatibility.
- The `current-context` field is required; if absent, the system will report an error rather than guessing a default context.
- Authentication credentials are configured per-service within a context (not per-context). Each service block independently supports API key or username/password auth.
- The set of recognized service types (`elasticsearch`, `kibana`, `cloud`) is fixed at compile time. Adding a new service type requires a code change and is a versioned, deliberate update.
