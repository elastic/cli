# Research: JSON Input Support

## Decision: Stdin Reading Strategy

**Decision**: Use `fs.readFileSync(0, 'utf-8')` (file descriptor 0) for synchronous stdin reading.

**Rationale**: This is the simplest cross-platform approach. File descriptor 0 is stdin on all platforms (Windows, Linux, macOS). Synchronous reading avoids async stream complexity and is appropriate since the CLI blocks on input anyway. The TTY guard (`!process.stdin.isTTY`) prevents blocking on interactive terminals.

**Alternatives considered**:
- `fs.readFileSync('/dev/stdin', 'utf-8')` — Works on POSIX only; fails on Windows. Rejected per Principle VII.
- Async stream reading (`process.stdin` readable stream) — Adds unnecessary complexity for a synchronous CLI command. Would require converting `defineCommand`'s action to handle async stdin before handler invocation. Rejected for simplicity.
- Third-party library (e.g., `get-stdin`) — Rejected per Principle VI (minimal dependencies).

## Decision: `ParsedResult.input` Type

**Decision**: Type the `input` field as `unknown`.

**Rationale**: `JSON.parse` returns `any`. Using `unknown` forces handlers to narrow the type explicitly, which is safer than `object` (excludes valid JSON arrays, strings, numbers) or `any` (no type safety). This aligns with the spec's deferral of schema validation — the handler or a future validation layer will narrow the type.

**Alternatives considered**:
- `object` — Too restrictive; valid JSON includes arrays and primitives.
- `Record<string, unknown>` — Same problem; excludes arrays.
- `any` — No type safety; handlers could use properties without checking.
- `JsonValue` custom union type — Over-engineering for this phase; `unknown` provides the same safety with less code.

## Decision: `--file` Option Collision Detection

**Decision**: Add a check in `defineCommand` (before Commander registration) that throws if `config.input === true` and any option in `config.options` has `long === 'file'`.

**Rationale**: Follows the existing `validateOptions` pattern of failing fast at definition time. This is a simple string check with zero runtime cost. The error is thrown during command registration (startup), not at invocation time, making it impossible to ship a broken command definition.

**Alternatives considered**:
- Runtime detection (error only when `--file` is actually used) — Too late; confusing for users. Rejected.
- Namespace the option (e.g., `--input-file`) — Avoids collision entirely but deviates from the spec's `--file` convention and Constitution Principle II. Rejected.

## Decision: Empty Content Handling

**Decision**: Treat empty content (0 bytes or whitespace-only) as a JSON parse error.

**Rationale**: Per clarification session, empty strings are not valid JSON. Treating them as "no input" would silently mask mistakes (e.g., pointing `--file` at the wrong file). `JSON.parse('')` throws a SyntaxError natively, so no special handling is needed beyond the existing parse error path. However, a dedicated empty-content check before `JSON.parse` allows a clearer error message ("empty content" vs. cryptic SyntaxError text).

**Alternatives considered**:
- Treat as "no input" (undefined) — Masks user errors silently. Rejected per clarification.
- Only check for 0-byte, not whitespace-only — `JSON.parse('   ')` also throws SyntaxError, so whitespace-only is effectively handled by the parse error path. Explicit check is optional but improves error clarity.
