# Feature spec: Core Utilities — Constitutional Foundations

**Feature Branch**: `002-core-utils-constitution`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "Create core utilities that reflect the constitutional requirements, and apply them to a single refactor task."

## Overview

The elastic CLI constitution defines six non-negotiable principles that every command must honour. Currently, the codebase lacks shared utilities to enforce these principles — commands implement ad-hoc input handling, produce inconsistent error shapes, have no schema-backed validation, and offer no `--dry-run` capability. This feature creates the foundational, reusable utility layer that makes constitutional compliance straightforward and consistent, then validates the layer by refactoring one existing command to use it end-to-end.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Structured Error Output (Priority: P1)

As an agent or automation consumer, when a command fails I receive a consistent, machine-parseable error response that includes a short code and a human-readable message, formatted as JSON when `--format=json` is in use and as a readable string otherwise.

**Why this priority**: Every subsequent utility depends on a reliable error contract. Agents break silently when error shapes are inconsistent. This is the lowest-level primitive.

**Independent Test**: Run any command with invalid input and `--format=json`; the exit-nonzero response must be `{"error":{"code":"...","message":"..."}}`. Can be demonstrated with no other utilities present.

**Acceptance Scenarios**:

1. **given** a command is invoked with `--format=json` and produces an error, **when** output is parsed, **then** it yields `{"error":{"code":"<string>","message":"<string>"}}` with a non-zero exit code.
2. **given** a command is invoked without `--format=json` and produces an error, **when** the output is read, **then** it is a human-readable string printed to stderr and exits non-zero.
3. **given** two different commands each return the same category of error (e.g. validation failure), **when** their JSON error outputs are compared, **then** the `code` field matches.

---

### User Story 2 — Shared Context Resolution (Priority: P1)

As a developer adding a new command, I can resolve the active Elasticsearch/Kibana context with a single shared call rather than duplicating the 10-line config-load-and-resolve block that currently appears in every command's `RunE`.

**Why this priority**: Duplication is the root cause of inconsistency. Every command that touches network I/O today replicates the same context-resolution logic. A single utility removes the duplication and becomes the enforcement point for Principle IV.

**Independent Test**: A unit test that exercises the utility in isolation with a mock config; a command that calls it returns the correct context or a clean error.

**Acceptance Scenarios**:

1. **given** a valid config with a named current-context, **when** the utility is called without an explicit override, **then** it returns the matching context configuration.
2. **given** a `--context=<name>` flag is set, **when** the utility is called, **then** it returns the named context, ignoring the current-context default.
3. **given** no current-context is set and no `--context` flag is provided, **when** the utility is called, **then** it returns a structured error with a helpful remediation hint.
4. **given** a context name is provided that does not exist in the config, **when** the utility is called, **then** it returns a structured error naming the missing context and suggesting `elastic config context list`.

---

### User Story 3 — Dry-Run Support Utility (Priority: P2)

As a user or agent invoking any mutating command, I can pass `--dry-run` to validate all inputs (flags and arguments as declared by the command's core-utility-based spec) and print the resolved, validated inputs without executing any action, then receive exit code 0. No per-command payload type is required — the utility derives what to print from the command's declared configuration.

**Why this priority**: Constitution Principle III mandates `--dry-run` on every mutation/network command. A shared utility means this capability is implemented once and adopted uniformly.

**Independent Test**: Any command that calls the utility can be tested with `--dry-run`; it must exit 0 and print a deterministic payload with no network calls made.

**Acceptance Scenarios**:

1. **given** a command supports `--dry-run` and is invoked with valid inputs plus `--dry-run`, **when** it runs, **then** it prints the resolved request payload and exits 0 without performing any network call.
2. **given** a command is invoked with `--dry-run` and invalid inputs, **when** it runs, **then** it exits non-zero with a structured validation error before any payload is printed.
3. **given** `--dry-run` is combined with `--format=json`, **when** it runs, **then** the payload is printed as JSON.

---

### User Story 4 — All `es` Commands Refactored to Use All Utilities (Priority: P2)

As a developer reviewing the codebase, I can point to the fully-refactored `es`-family commands as the canonical reference implementations demonstrating how all the new utilities are composed correctly. The first-completed command serves as the template; the remaining five follow the same pattern.

**Why this priority**: Utilities without adoption demonstrate nothing. Refactoring all six `es` commands proves the utilities are ergonomic, complete, and tested across the full `es` surface. The first refactor becomes the template for the rest.

**Independent Test**: The chosen command's existing test coverage continues to pass; new tests cover the paths exercised by each utility; no net regression.

**Acceptance Scenarios**:

1. **given** the refactored command, **when** its implementation is reviewed, **then** it contains no duplicated context-resolution logic, no inline error formatting, and no hand-rolled dry-run guard.
2. **given** the refactored command is invoked with `--dry-run`, **when** it runs, **then** dry-run behaviour is correct per User Story 3.
3. **given** the refactored command is invoked with `--format=json` and an error occurs, **when** the output is inspected, **then** the error matches the contract in User Story 1.
4. **given** the refactored command's existing test suite, **when** run, **then** all prior tests pass and coverage for the new utility paths is present.

---

### Edge Cases

- **Resolved**: When the config file is missing entirely, the context-resolution utility MUST return a `StructuredError` with code `config_not_found` and a remediation hint (e.g. "run `elastic config init`"). This is a distinct error from `context_not_found` (file present but context absent).
- **Resolved**: When `--dry-run` is passed to a read-only (non-mutating) command that does not register the flag, the command MUST return a `StructuredError` with an appropriate code (e.g. `"dry_run_not_supported"`) and exit non-zero. Silent ignoring is explicitly not permitted.
- **Resolved**: When an upstream error is already a `StructuredError`, the constructor/wrap helper MUST return it unchanged — no double-wrapping. The original `code` and `message` are preserved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The codebase MUST expose a shared `StructuredError` type (or equivalent) with at minimum a `code` string field and a `message` string field, usable by all commands.
- **FR-002**: Every error returned through `--format=json` MUST serialize to `{"error":{"code":"<string>","message":"<string>"}}`.
- **FR-003**: The codebase MUST expose a single context-resolution utility that accepts the global context flag value and a loaded config, and returns either a resolved context configuration or a `StructuredError`.
- **FR-004**: The context-resolution utility MUST surface a remediation hint in its error message when no context is configured.
- **FR-004a**: The context-resolution utility MUST return a `StructuredError` with code `config_not_found` and a remediation hint pointing to `elastic config init` when the config file does not exist on disk (distinct from `context_not_found`).
- **FR-005**: The codebase MUST expose a dry-run utility (function or middleware) that commands built on core utilities can opt into. When `--dry-run` is active, the utility MUST: (1) validate all declared inputs (flags/arguments) against the command's declared spec, (2) on validation failure exit non-zero with a `StructuredError`, and (3) on success print the resolved, validated inputs and exit 0 — without performing any I/O. No per-command payload type is required; the utility derives printable output from the command's declared configuration.
- **FR-006**: The dry-run utility MUST honour `--format=json` when printing the resolved payload.
- **FR-007**: All six `es`-family commands (`es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`, `es query`, `es raw`) MUST be refactored to use `StructuredError`, the context-resolution utility, and dry-run support. The first-completed command serves as the canonical reference implementation; the remainder follow the same pattern. (`es raw` is included in this feature's scope as an interim refactor; a future feature will replace it wholesale.)
- **FR-008**: All new utility code MUST have unit test coverage; the refactored command MUST retain its existing test coverage and add tests for the newly exercised utility paths.
- **FR-009**: All exported symbols in the utility packages MUST carry complete Go doc comments.
- **FR-010**: A command that does not register `--dry-run` MUST return a `StructuredError` (code: `dry_run_not_supported`) and exit non-zero if the flag is somehow passed; it MUST NOT silently ignore it.
- **FR-001a** (amends FR-001): The `StructuredError` constructor or wrap helper MUST detect when the input error is already a `StructuredError` and return it unchanged rather than wrapping it.
- **FR-011**: The utility package MUST define error codes as exported Go string constants (e.g. `ErrCodeValidation`, `ErrCodeConfigNotFound`, `ErrCodeContextNotFound`, `ErrCodeDryRunNotSupported`). Commands MUST use these constants; free-form code strings are not permitted.

### Key Entities

- **StructuredError**: Carries `Code` (short machine-readable string) and `Message` (human-readable string). Implements the `error` interface. Serialises to `{"error":{"code":"...","message":"..."}}` under `--format=json`.
- **StructuredError** (amended): The wrap/constructor function is idempotent — passing a `StructuredError` as input returns that same value unchanged.
- **StructuredError** (amended): `Code` MUST be one of the exported string constants defined in the utility package; the type remains `string` but valid values are enumerated as constants.
- **ResolvedContext**: The validated, fully-populated connection configuration returned by the context-resolution utility, ready for use by client constructors.
- **DryRunPayload** (removed as a distinct entity): Dry-run output is derived automatically from the command's declared flag/argument configuration by the dry-run utility. No per-command payload type is needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero commands in the `es` family duplicate the context-resolution block after the refactor is complete (verified by code review of all six refactored commands: `es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`, `es query`, `es raw`).
- **SC-002**: 100% of error responses produced by the refactored command under `--format=json` conform to `{"error":{"code":"...","message":"..."}}` — verifiable by automated test assertions.
- **SC-003**: The refactored command's `--dry-run` path is covered by at least one unit test that asserts no network calls are made and exit code is 0.
- **SC-004**: All new utility packages achieve at minimum 80% statement coverage as reported by `go test -cover`.
- **SC-005**: The full test suite (`go test ./...`) passes without regression after the refactor.

## Assumptions

- All six `es`-family commands (`es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`, `es query`, `es raw`) are refactored in this feature. `es raw` is an interim refactor only — a future feature will replace it; the refactor here brings it into constitutional compliance in the meantime.
- The dry-run utility is scoped to printing a human-readable or JSON representation of what *would* be sent — it does not require a formal request-object type common to all commands at this stage.
- "Core utilities" live under `internal/` following existing project conventions; no new top-level packages are introduced.
- The feature **partially** addresses Principle II: error I/O shape (`StructuredError` + `RenderError`) is delivered; `--data` JSON input, `--help --format=json` schema introspection, and response templating are deferred to a future feature. This feature fully addresses Principles III (dry-run + validation errors) and IV (context management).


## Clarifications

### Session 2026-03-17

- Q: What happens when `--dry-run` is passed to a read-only (non-mutating) command that does not register the flag? → A: Return a structured error (`code: dry_run_not_supported`) and exit non-zero; silent ignoring is not permitted.
- Q: What happens when the config file is missing entirely (not just a missing context)? → A: Return a `StructuredError` with code `config_not_found` and a remediation hint (e.g. "run `elastic config init`"); distinct from the no-context-configured error.
- Q: How does the structured error utility behave when an upstream error already contains a code (no double-wrapping)? → A: Pass through unchanged — if the input is already a `StructuredError`, the constructor returns it as-is; no wrapping occurs.
- Q: Should error codes be a predefined set of constants or free-form strings? → A: Predefined exported Go string constants in the utility package; commands use only those values.
- Q: What interface does the dry-run utility use to obtain the payload from each command? → A: No per-command payload type is needed. The dry-run utility validates and prints the command's declared inputs (flags/arguments) directly from the command's core-utility-based configuration — it "just works" for any command built on core utilities.