# Implementation Plan: JSON Input Support

**Branch**: `003-json-input-support` | **Date**: 2026-03-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/003-json-input-support/spec.md`

**Scope note**: Per user direction, this plan focuses on the basic ability to pull JSON in from stdin or `--file` and pass it to the handler as a plain object. No further validation or deserializing is handled here.

## Summary

Add a boolean `input` flag to `CommandConfig`. When set, the factory automatically registers a `--file <path>` option and reads piped stdin. Before invoking the handler, the factory reads the selected source, parses it with `JSON.parse`, and attaches the result to `ParsedResult` as an optional `input` field. No schema validation, transformation, or required-ness enforcement occurs at this layer.

## Technical Context

**Language/Version**: TypeScript 6.0.2 on Node.js (native type stripping via `--experimental-strip-types`)
**Primary Dependencies**: Commander.js v14 (CLI framework), Node.js `fs` and `process.stdin` (built-in)
**Storage**: N/A (reads files, does not persist)
**Testing**: Node.js built-in test runner (`node:test`) with `node --test`
**Target Platform**: Windows, Linux, macOS (Principle VII)
**Project Type**: CLI tool
**Performance Goals**: N/A — file/stdin reads are bounded by OS I/O
**Constraints**: No new dependencies allowed (Principle VI). Must use `fs.readFileSync` / stream reading from stdlib only.
**Scale/Scope**: Touches `src/factory.ts` (interface changes + `defineCommand` logic) and `test/factory.test.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Config-Driven Commands | ✅ Pass | `input: true` is a declarative config flag; no bespoke imperative code |
| II. Agent-First I/O | ✅ Pass | This feature directly implements the stdin/`--file` requirement from Principle II |
| III. Input Validation & Safety | ✅ Pass (scoped) | JSON parse validation is included; schema validation explicitly deferred per spec FR-011 |
| IV. Context-Based Configuration | ✅ N/A | No config/context changes |
| V. Test-First Development | ✅ Required | All changes follow red/green TDD cycle |
| VI. Minimal Dependencies | ✅ Pass | Uses only Node.js builtins (`fs`, `process.stdin`) |
| VII. Cross-Platform Compatibility | ✅ Required | File path handling via `path` module; TTY detection via `process.stdin.isTTY` (cross-platform) |

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-json-input-support/
├── plan.md             # This file
├── research.md         # Phase 0 output
├── data-model.md       # Phase 1 output
├── quickstart.md       # Phase 1 output
├── contracts/          # Phase 1 output
│   └── parsed-result.md
└── tasks.md            # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── cli.ts              # Existing — no changes expected
└── factory.ts          # Modified — CommandConfig.input, ParsedResult.input, defineCommand logic

test/
└── factory.test.ts     # Modified — new test cases for JSON input
```

**Structure Decision**: Single project layout. All changes are confined to the existing `src/factory.ts` and `test/factory.test.ts` files. No new files or directories are needed in the source tree.

## Design

### Interface Changes

#### `CommandConfig` — add `input` field

Add an optional boolean field:
```
input?: boolean
```
When `true`, the factory enables JSON input support for the command.

#### `ParsedResult` — add `input` field

Add an optional field to carry the parsed JSON:
```
input?: unknown
```
Typed as `unknown` (not `object` or `Record`) because valid JSON can be any type — object, array, string, number, boolean, or null. The handler is responsible for narrowing the type. This aligns with the spec's explicit deferral of validation (FR-011).

### Factory Logic (`defineCommand`)

When `config.input === true`:

1. **Definition-time validation (FR-012)**: Check that no option in `config.options` has `long === 'file'`. If collision detected, throw an Error (same pattern as existing `validateOptions`).

2. **Register `--file` option (FR-002)**: Add `--file <path>` as a string option via Commander.js.

3. **In the action handler, before calling `config.handler`** (FR-003 through FR-010, FR-013):

   a. Read `--file` value from parsed Commander options.

   b. Detect stdin: `!process.stdin.isTTY` indicates piped data.

   c. **Conflict check (FR-007)**: If both `--file` is provided AND stdin is piped, call `cmd.error()` with a message indicating only one input source is allowed.

   d. **Read source**:
      - If `--file` provided: read the file synchronously with `fs.readFileSync(filePath, 'utf-8')`. If file not found, `cmd.error()` with descriptive message (FR-008).
      - If stdin piped: read all of stdin to a string. Use `fs.readFileSync('/dev/stdin', 'utf-8')` on POSIX or `fs.readFileSync(0, 'utf-8')` with file descriptor 0 for cross-platform support (Principle VII).
      - If neither: skip — `input` field remains `undefined` in `ParsedResult` (FR-010).

   e. **Parse JSON (FR-004, FR-009, FR-013)**: If raw content was read:
      - If the content is empty (0 bytes / empty string after trim), `cmd.error()` with a parse error message.
      - Otherwise, `JSON.parse(content)`. Wrap in try/catch; on `SyntaxError`, `cmd.error()` with descriptive parse error.
      - On success, assign result to `parsed.input`.

### Stdin Reading — Cross-Platform Approach

Node.js `fs.readFileSync(0, 'utf-8')` reads from file descriptor 0 (stdin) synchronously on all platforms. This avoids async stream complexity and works on Windows, Linux, and macOS. The only caveat: if stdin is a TTY and no data is piped, this would block — but the `!process.stdin.isTTY` guard (step 3b) prevents that path from executing.

### Error Message Format

All errors use `cmd.error()` (Commander.js built-in), which routes through `configureErrorOutput` for consistent formatting. Error messages:

- File not found: `"--file: file not found: {path}"`
- JSON parse error (file): `"--file: invalid JSON: {SyntaxError.message}"`
- JSON parse error (stdin): `"stdin: invalid JSON: {SyntaxError.message}"`
- Empty content (file): `"--file: invalid JSON: empty content"`
- Empty content (stdin): `"stdin: invalid JSON: empty content"`
- Dual input conflict: `"cannot read input from both --file and stdin; provide one or the other"`

### What This Plan Does NOT Cover

Per user direction and spec FR-011:
- No Zod schema validation of the parsed JSON
- No type coercion or deserialization beyond `JSON.parse`
- No required-input enforcement at the factory level
- No `--format=json` error output (separate feature)
