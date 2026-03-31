# Research: Shared Command Builder

**Branch**: `001-shared-command-builder` | **Date**: 2026-03-30

## R-001: Commander.js wrapping strategy

**Decision**: Use Commander.js as the internal engine, fully hidden behind the factory API. The factory function creates Commander `Command` instances internally and wires up argument/option parsing, type coercion, and handler invocation. Command authors never import or interact with Commander directly.

**Rationale**: Commander.js is already a project dependency (v14), handles cross-platform argument parsing, help generation, and nested subcommands out of the box. Wrapping it (rather than replacing it) minimizes new code while providing a stable abstraction boundary.

**Alternatives considered**:
- **Build custom parser from scratch**: High effort, duplicates well-tested functionality, violates Principle VI (Minimal Dependencies — stdlib preferred but Node stdlib has no CLI parser).
- **Use Zod for parsing directly**: Zod is already a dependency and excellent for validation, but it doesn't handle CLI argument parsing (flag syntax, help generation, etc.). However, Zod will be used for type coercion/validation of parsed values.

## R-002: Type coercion and validation approach

**Decision**: Use Zod schemas internally to validate and coerce parsed argument/option values after Commander extracts them as strings. Each argument/option definition in the factory config includes a declared type (`string`, `number`, `boolean`). The factory builds a Zod schema from these declarations and validates the parsed output before passing it to the handler.

**Rationale**: Zod is already a project dependency, provides excellent TypeScript type inference, and aligns with Constitution Principle III (Input Validation & Safety) which mandates JSON Schema validation. Zod can generate JSON Schema representations for future `--help --format=json` support.

**Alternatives considered**:
- **Manual type coercion**: Simple `Number()`, `Boolean()` calls — fragile, no structured error messages, doesn't scale to future validation needs.
- **Commander's built-in argument processing**: Limited, doesn't produce structured errors, and would couple command definitions to Commander's API.

## R-003: Nested subcommand support

**Decision**: The factory supports two modes: defining a **leaf command** (has arguments, options, and a handler) and defining a **command group** (has a name, description, and child commands). Command groups are defined by nesting factory calls. Commander.js natively supports this via `.addCommand()`.

**Rationale**: The Elasticsearch domain naturally organizes into groups (cluster, index, search, etc.). Commander.js supports arbitrary nesting depth natively.

**Alternatives considered**:
- **Flat command namespace with dot notation** (e.g., `elastic cluster.health`): Unconventional, confuses shell completion, not discoverable.
- **File-system-based routing**: Over-engineered for current needs, adds implicit coupling.

## R-004: Constitution alignment — JSON Schema and agent-first features

**Decision**: The initial factory implementation focuses on argument parsing and type coercion only. However, the factory's config structure is designed to be forward-compatible with Constitution requirements: JSON Schema generation (Principle II), `--format=json` output (Principle II), `--dry-run` support (Principle III), and context-based configuration (Principle IV). These will be added in future iterations without changing the command definition interface.

**Rationale**: The spec explicitly states "for now it should just handle argument parsing, but will be expanded." The factory's declarative config approach naturally supports progressive enhancement — each new cross-cutting concern is added to the factory internals, not to individual command definitions.

**Alternatives considered**:
- **Implement all Constitution features in v1**: Scope creep; the spec limits this iteration to argument parsing.

## R-005: Export pattern and module location

**Decision**: The command factory is exported as a named export `defineCommand` from `src/factory.ts`, per user direction. A separate `defineGroup` export handles command groups. The factory returns the configured Commander `Command` instance (typed as an opaque handle) so the main CLI entrypoint can register it.

**Rationale**: User explicitly specified the file location and "factory" pattern. Named exports allow tree-shaking and clear import semantics. Returning an opaque handle (not the raw Commander type) preserves the abstraction boundary.

**Alternatives considered**:
- **Default export**: Less explicit, harder to extend with multiple exports (defineCommand, defineGroup).
- **Class-based builder pattern**: More verbose, less aligned with the declarative config-driven approach from Constitution Principle I.
