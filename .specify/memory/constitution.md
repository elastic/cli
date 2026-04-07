<!--
SYNC IMPACT REPORT
==================
Version change: 1.2.0 → 1.2.1 (PATCH — wording update to reflect renamed global flags)

Modified principles:
  - Principle II: updated `--file=<path>` → `--input-file=<path>`, `--format=json` → `--json`.
  - Principle III: updated `--format=json` error payload reference → `--json`.
  - Principle IV: updated `--context=<name>` → `--use-context=<name>`.
  - Development Standards: updated `--format=json` error reference → `--json`.

Added sections:
  - None.

Removed sections:
  - None.

Templates reviewed:
  - .specify/templates/plan-template.md  ✅ no changes required.
  - .specify/templates/spec-template.md  ✅ no changes required.
  - .specify/templates/tasks-template.md ✅ no changes required.
  - .specify/templates/agent-file-template.md ✅ no changes required.
  - .specify/templates/checklist-template.md  ✅ no changes required.
  - .specify/templates/constitution-template.md ✅ source template; no update required.

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): confirm original adoption date.
-->

# elastic CLI Constitution

## Core Principles

### I. Config-Driven Commands

Every command MUST be defined through a shared configuration structure rather than
bespoke imperative code. Custom logic is permitted only for behaviour that cannot
be expressed in config. This ensures consistency, discoverability, and testability
across the entire command surface.

- Command metadata (name, aliases, description) is declared in config.
- Input shape is defined by a JSON Schema attached to the config — not inferred
  from ad-hoc flag parsing.
- Help text MUST be sourced from the schema's `description` fields; no separate
  help strings are permitted for the same concept.

### II. Agent-First I/O (NON-NEGOTIABLE)

The CLI MUST treat automated agents as first-class consumers alongside human users.

- Every command MUST accept input as JSON via piped stdin or `--input-file=<path>`.
- Every command MUST emit machine-readable JSON when `--json` is provided.
- `--help --json` MUST return the command's full JSON Schema so agents can
  introspect valid inputs without running the command.
- All top-level JSON Schema fields MUST also be addressable as individual CLI flags
  so human users are not forced to compose JSON.
- Arguments for response templating and field masks MUST be available on every
  command so agents can control context growth precisely.

### III. Input Validation & Safety (NON-NEGOTIABLE)

All input MUST be validated against the command's JSON Schema before any action is
taken. Failures are hard errors that exit immediately with a structured error
payload (JSON when `--json`).

- Validation is enabled by default and MUST NOT be bypassable at runtime except
  via explicit opt-out flags that are themselves documented and logged.
- Every command that performs a mutation or network call MUST support `--dry-run`,
  which validates inputs and prints the resolved request payload, then exits 0
  without executing the action.
- Schema MUST require `description` on every input field, making exhaustive
  `--help` output automatic and free.

### IV. Context-Based Configuration (kubectl-style)

Connection info and credentials MUST be managed through a YAML config file that
defines one or more named contexts, mirroring `kubectl` conventions.

- Each context contains all values needed to reach Elasticsearch, Kibana, and/or
  other Elastic services (URLs, credentials, TLS settings, etc.).
- A single context is designated as the active default.
- Any command MAY override the active context for a single invocation via
  `--use-context=<name>`.
- Credentials MUST NOT be accepted as bare CLI flags on operational commands; they
  belong exclusively in the config file or environment variables mapped to context
  fields.

### V. Test-First Development (NON-NEGOTIABLE)

All code changes MUST follow the red/green TDD cycle as an internal agent
discipline. The purpose is to reduce implementation churn: writing tests first
forces a precise understanding of the required behaviour before any implementation
code is written, preventing large-scale rewrites caused by discovering
misunderstood requirements mid-implementation.

1. Write a failing test that captures the intended behaviour (red).
2. Confirm the test fails for the right reason before writing implementation code.
3. Write the minimum implementation to make the test pass (green).
4. Refactor under green, keeping tests passing.

- No implementation code is written before a corresponding failing test exists.
- Unit tests are required for every change; integration tests are required wherever
  a real Elastic service boundary is exercised.
- The test suite MUST remain passing on the main branch at all times.

### VI. Minimal Dependencies

External dependencies MUST be kept to the smallest set that is demonstrably
necessary. Each dependency is a security and maintenance liability.

- Before adding a new module, the team MUST confirm the stdlib cannot satisfy the
  need.
- Dependencies are reviewed at each PR for transitive additions.
- Standard library packages are always preferred over third-party equivalents
  for JSON handling, HTTP, templating, and flag parsing.

### VII. Cross-Platform Compatibility (NON-NEGOTIABLE)

All functionality MUST work correctly and identically on Windows, Linux, and macOS.
No feature, command, or internal utility MAY be shipped if it is known to fail or
behave differently on any of these three platforms.

- File path construction MUST use platform-agnostic APIs (e.g., `path.join`);
  hard-coded path separators (`/` or `\`) are forbidden in path logic.
- Config file locations MUST resolve via OS-standard directories
  (e.g., `os.homedir()`, `process.env.APPDATA`) rather than Unix-only assumptions.
- Shell-specific behaviour (signal handling, TTY detection, ANSI escape codes)
  MUST be guarded behind platform capability checks.
- CI MUST run the full test suite on all three platforms before merge. A test
  passing only on Linux/macOS does not satisfy the green requirement of Principle V.
- Any platform-specific code path MUST be clearly isolated and documented with the
  rationale for the divergence.

## Development Standards

- **Docstrings**: All exported symbols in reusable core utilities MUST have
  complete, machine-parseable doc comments (`/** .. */`). Non-exported
  helpers warrant a comment when their purpose is non-obvious.
- **Generated documentation**: Because JSON Schema `description` fields are
  exhaustive, CLI reference docs MUST be generated from schema + command metadata
  rather than authored manually. Any exception requires written justification.
- **Error messages**: Errors MUST be structured and distinguishable (error code +
  human message). When `--json`, errors MUST serialize to JSON with at
  minimum `{"error": {"code": "…", "message": "…"}}`.
- **Node.js ecosystem conventions**: Standard JavaScript/TypeScript idioms, `npm test`,
  MUST pass before merge. Any deviation from ecosystem idioms MUST be
  explained in a comment or docstring at the point of deviation.
- **Comments**: Explain *why*, not *what*. Avoid restating code in prose.

## Governance

- This constitution supersedes any conflicting guidance in README, docs, or prior
  conventions.
- Amendments require: (1) a draft PR updating this file, (2) a version bump per
  the policy below, (3) a Sync Impact Report (HTML comment at the top of this
  file), and (4) propagation of changes to all affected templates and docs.
- **Versioning policy** — semantic rules for `CONSTITUTION_VERSION`:
  - MAJOR: Removal or incompatible redefinition of an existing principle.
  - MINOR: Addition of a new principle or material expansion of existing guidance.
  - PATCH: Clarifications, wording fixes, or non-semantic refinements.
- All PRs MUST include a "Constitution Check" confirming no principles are
  violated. Violations MUST be justified with an entry in the plan's Complexity
  Tracking table.
- Compliance is reviewed by the team lead at each milestone. Persistent violations
  constitute grounds for blocking the milestone.
- Runtime development guidance for agents lives in `.specify/memory/` alongside
  this file.

### VIII. Transport-Layer Abstraction

The CLI MUST NOT expose HTTP transport implementation details to users in any
user-facing surface — including help text, flag descriptions, JSON Schema output,
or error messages.

- Parameters are user-visible by their *semantic purpose* (e.g. "Index to target",
  "Timeout for the request"), not by their HTTP location (path, query string, body).
- Internal routing metadata (`found_in`) is an implementation concern of the
  request-builder layer and MUST remain invisible to CLI consumers.
- Feature work that would expose routing labels (e.g. `[path]`, `[query]`,
  `[body]`) in help text or schema output is explicitly out of scope and MUST be
  declined; it leaks the HTTP transport contract into the user interface.
- Schema introspection tooling for *developers* of the CLI itself (not end users)
  may inspect `found_in` values internally, but MUST NOT propagate them outward.

**Version**: 1.2.1 | **Ratified**: TODO(RATIFICATION_DATE): confirm adoption date | **Last Amended**: 2026-04-06
