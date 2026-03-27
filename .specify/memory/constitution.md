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

- Every command MUST accept input as JSON via piped stdin or `--file=<path>`.
- Every command MUST emit machine-readable JSON when `--format=json` is provided.
- `--help --format=json` MUST return the command's full JSON Schema so agents can
  introspect valid inputs without running the command.
- All top-level JSON Schema fields MUST also be addressable as individual CLI flags
  so human users are not forced to compose JSON.
- Arguments for response templating (e.g. Go `text/template`) and field masks MUST
  be available on every command so agents can control context growth precisely.

### III. Input Validation & Safety (NON-NEGOTIABLE)

All input MUST be validated against the command's JSON Schema before any action is
taken. Failures are hard errors that exit immediately with a structured error
payload (JSON when `--format=json`).

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
  `--context=<name>`.
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
- Go standard library packages are always preferred over third-party equivalents
  for JSON handling, HTTP, templating, and flag parsing.

## Development Standards

- **Docstrings**: All exported symbols in reusable core utilities MUST have
  complete, machine-parseable Go doc comments (`// FunctionName …`). Non-exported
  helpers warrant a comment when their purpose is non-obvious.
- **Generated documentation**: Because JSON Schema `description` fields are
  exhaustive, CLI reference docs MUST be generated from schema + command metadata
  rather than authored manually. Any exception requires written justification.
- **Error messages**: Errors MUST be structured and distinguishable (error code +
  human message). When `--format=json`, errors MUST serialize to JSON with at
  minimum `{"error": {"code": "…", "message": "…"}}`.
- **Go ecosystem conventions**: Standard Go idioms, `go vet`, `golangci-lint`, and
  `go test -race` MUST pass before merge. Any deviation from idiomatic Go MUST be
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

**Version**: 1.0.1 | **Ratified**: TODO(RATIFICATION_DATE): confirm adoption date | **Last Amended**: 2026-03-17
