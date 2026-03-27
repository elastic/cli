# Feature spec: JSON Output Format Flag

**Feature Branch**: `003-json-output-format`
**Created**: 2026-03-27
**Status**: Draft
**Input**: User description: "If a --format=json argument is provided for any command, any output should be printed as valid JSON, with no non-JSON text before or after, so that the data can be directly piped into other commands."

## Clarifications

### Session 2026-03-27

- Q: Error Output Stream for JSON Mode → A: JSON errors go to stdout (like aws-cli, gcloud when using --format=json)
- Q: JSON Response Structure Consistency → A: Consistent envelope: `{"data": X, "error": null}` vs `{"data": null, "error": Y}`
- Q: Warning Message Handling in JSON Mode → A: Embed warnings in JSON envelope: `{"data": X, "error": null, "warnings": [...]}`
- Q: Progress/Spinner Output Suppression → A: Complete suppression of all progress/spinner output in JSON mode
- Q: Error Structure Detail Level → A: Structured: `{"error": {"code": "invalid_argument", "message": "..."}}`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Machine-readable output for scripting (Priority: P1)

A user running the CLI in a script or pipeline passes `--format=json` to receive structured output that can be directly piped into tools like `jq`, `fx`, or other commands that consume JSON.

**Why this priority**: This is the core value of the feature. Any command that supports `--format=json` must emit pure, valid JSON — no banners, no prompts, no status messages — so automated pipelines work reliably.

**Independent Test**: Run any command with `--format=json` and pipe the output to `jq .`; it must parse without error and produce the expected data.

**Acceptance Scenarios**:

1. **given** a command is run with `--format=json`, **when** the command succeeds, **then** stdout contains only valid JSON with no surrounding text
2. **given** a command is run with `--format=json`, **when** the command succeeds, **then** the JSON output can be piped directly into `jq` or equivalent tools without errors
3. **given** a command is run without `--format=json`, **when** the command succeeds, **then** output is unchanged from current behavior (human-readable text)

---

### User Story 2 - Error output does not break JSON pipelines (Priority: P2)

A user running a CLI command with `--format=json` that encounters an error (e.g., invalid arguments, authentication failure, network issue) still receives a JSON-formatted error response rather than a plain-text error message.

**Why this priority**: A mixed-format pipeline breaks silently. If errors produce text while successes produce JSON, automated scripts cannot reliably detect failure conditions.

**Independent Test**: Trigger an error condition on any command with `--format=json`; the stdout output should be a valid JSON object describing the error, not a plain-text message.

**Acceptance Scenarios**:

1. **given** a command is run with `--format=json`, **when** the command fails (e.g., missing required argument, server error), **then** the error is reported as a consistent JSON envelope with structured error codes (e.g., `{"data": null, "error": {"code": "invalid_argument", "message": "..."}}`) rather than unstructured text
2. **given** a command is run with `--format=json`, **when** a recoverable warning exists alongside successful output, **then** warnings are embedded in the JSON envelope structure (e.g., `{"data": X, "error": null, "warnings": [...]}`) not printed as plain text

---

### User Story 3 - Consistent flag across all commands (Priority: P3)

A user can rely on `--format=json` being available on every command in the CLI, rather than only a subset.

**Why this priority**: Inconsistent availability forces users to check per-command documentation and makes scripting fragile.

**Independent Test**: Run `--help` on each command and confirm `--format` is listed as an available flag.

**Acceptance Scenarios**:

1. **given** any command in the CLI, **when** the user passes `--format=json`, **then** the flag is recognized (not treated as an unknown flag)
2. **given** a command whose output is already structured data, **when** `--format=json` is used, **then** the JSON output includes all fields present in the default human-readable output

---

### Edge Cases

- What happens when `--format` is provided with an unsupported value (e.g., `--format=xml`)? The command should fail with a clear error indicating supported formats.
- What happens when a command produces no output (e.g., a delete operation)? The JSON output should be an empty object `{}` or a status confirmation object, not an empty string.
- What happens when the command writes progress or spinner output to stdout? All progress indicators, spinners, and non-data output must be completely suppressed when `--format=json` is active.
- What happens when stdout is not a TTY and `--format=json` is not specified? JSON output is never automatic — `--format=json` must always be explicitly provided. Piping output without the flag produces the same human-readable text as terminal output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every CLI command MUST accept a `--format` flag with at least the value `json`
- **FR-002**: When `--format=json` is specified, stdout MUST contain only valid, parseable JSON — no preamble, no trailing text, no ANSI escape codes, no spinner output
- **FR-003**: When `--format=json` is specified, error conditions MUST be reported using consistent JSON envelope structure with machine-readable error codes (e.g., `{"data": null, "error": {"code": "invalid_argument", "message": "..."}}`) to stdout rather than unstructured text
- **FR-004**: When `--format=json` is NOT specified, command output MUST remain unchanged from its current human-readable form
- **FR-005**: When `--format` is given an unsupported value, the command MUST exit with a non-zero status and report the list of supported format values
- **FR-006**: When `--format=json` is specified, all progress indicators, spinners, and informational banners MUST be completely suppressed (warnings are handled via FR-008)
- **FR-007**: Commands that produce no meaningful data output (e.g., destructive operations with no return value) MUST emit consistent JSON envelope structure (e.g., `{"data": {"status": "ok"}, "error": null}`) rather than empty output
- **FR-008**: When `--format=json` is specified, warning messages MUST be embedded in the JSON envelope structure as a "warnings" array rather than output as separate text

### Key Entities

- **Command output**: The structured data a command produces; must be representable as a JSON object or array following consistent envelope structure (`{"data": X, "error": null, "warnings": []}`)
- **Format flag**: A top-level, globally inherited CLI flag (`--format`) that controls output serialization
- **Error object**: Structured error information containing machine-readable code and human-readable message (`{"code": "error_type", "message": "description"}`)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Output produced with `--format=json` passes JSON validation (e.g., `jq .`) on 100% of commands with zero additional transformation
- **SC-002**: Zero plain-text characters appear on stdout when `--format=json` is active, for both success and error paths
- **SC-003**: All existing commands recognize `--format=json` without requiring per-command changes by end users
- **SC-004**: A script piping multiple CLI commands together with `--format=json` runs end-to-end without parsing errors in a standard CI environment

## Assumptions

- The `--format` flag defaults to a human-readable text format when not specified; no existing behavior changes.
- JSON output structure for each command mirrors the data already shown in human-readable output — no additional fields are added solely for JSON mode.
- Warning messages are embedded in the JSON envelope structure as a "warnings" array field, ensuring all diagnostic information remains accessible to automated tools while maintaining JSON output purity.
- A globally registered persistent flag (inherited by all subcommands) is the implementation approach; individual commands need not opt in explicitly.
