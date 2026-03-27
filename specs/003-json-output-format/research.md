# Research: JSON Output Format Flag

**Phase**: 0 | **Date**: 2026-03-27 | **Plan**: [plan.md](./plan.md)

## Research Tasks

### RT-1: Cobra persistent flag for output format control

**Context**: Need a `--format` flag available on all commands without per-command registration.

**Decision**: Register `--format` as a `PersistentFlags().String()` on `rootCmd`, exactly like the existing `--context` flag.

**Rationale**: Cobra's persistent-flag inheritance is already proven in this codebase (`--context`). A persistent string flag on root automatically propagates to every subcommand. The factory's `RunE` can look it up via `cmd.Root().PersistentFlags().Lookup("format")` — the same pattern already used for `--context`.

**Alternatives considered**:
- Per-command flag registration in `factory.New()` — rejected because it duplicates the flag on every command and breaks the global-inheritance guarantee (FR-001).
- Environment variable (`ELASTIC_FORMAT`) — rejected because the spec requires an explicit `--format` flag. Env var support could be layered later but is out of scope.

---

### RT-2: JSON envelope design using stdlib `encoding/json`

**Context**: Spec requires a consistent envelope: `{"data": X, "error": null, "warnings": [...]}`.

**Decision**: Define an `Envelope` struct in a new `internal/output` package:

```go
type Envelope struct {
    Data     any      `json:"data"`
    Error    *Error   `json:"error"`
    Warnings []string `json:"warnings"`
}

type Error struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}
```

Marshal with `json.Marshal` (no `json.NewEncoder` to avoid trailing newline inconsistencies across Go versions). Append a single `\n` after the marshaled bytes for shell friendliness.

**Rationale**: `any` (alias for `interface{}`) lets each command return whatever data type it wants. `*Error` is a pointer so it marshals as `null` on success. `Warnings` marshals as `[]` (initialized to empty slice, never nil) so the envelope shape is always predictable.

**Alternatives considered**:
- `map[string]any` envelope — rejected because it loses compile-time field guarantees.
- `json.NewEncoder(os.Stdout).Encode()` — rejected because Encode adds a trailing newline that varies across Go versions and makes byte-exact testing harder.

---

### RT-3: Error code taxonomy

**Context**: Constitution requires `{"error": {"code": "…", "message": "…"}}`. Need a set of canonical codes.

**Decision**: Use a small set of snake_case error codes as string constants:

| Code | When |
|------|------|
| `unknown_command` | Cobra reports an unknown subcommand |
| `invalid_argument` | Flag validation or unsupported `--format` value |
| `config_error` | Config file unreadable or unparseable |
| `context_not_found` | `--context` names a nonexistent context |
| `input_error` | `--file` / stdin read failure or both provided |
| `command_failed` | Handler returns a generic error |

**Rationale**: Snake_case is the most common convention for machine-readable error codes in CLI tools (aws-cli, gcloud, gh). A small initial set avoids over-engineering; commands can introduce domain-specific codes later by returning typed errors.

**Alternatives considered**:
- Numeric error codes — rejected; harder to read in logs and scripts.
- Hierarchical codes (e.g., `input.file.not_found`) — rejected as premature; flat codes suffice for current command count.

---

### RT-4: Integration point — where formatting happens

**Context**: Need to decide where in the call chain JSON serialization occurs.

**Decision**: Modify `factory.New()` so that:
1. The `RunFunc` signature changes to return `(any, error)` instead of just `error` — the first return value is the data to render.
2. After the handler returns, `factory.New()`'s `RunE` wrapper checks the `--format` flag.
3. If `json`, it builds an `output.Envelope` and writes it to stdout.
4. If `text` (default), it calls a text-rendering callback (or `fmt.Fprintln` for simple values).

This keeps handlers format-agnostic: they return data and never write to stdout directly.

**Rationale**: Centralizing serialization in the factory means:
- New commands automatically get JSON support.
- Handlers cannot accidentally break JSON purity (no rogue `fmt.Println`).
- Testing is simpler — assert on returned data, not captured stdout.

**Alternatives considered**:
- Middleware/decorator on each command — rejected; more boilerplate, easy to forget.
- Handler writes its own JSON — rejected; violates DRY and risks inconsistent envelopes.

---

### RT-5: Error path in `Execute()` (root command)

**Context**: Currently `cmd.Execute()` catches errors and writes `Error: %s\n` to stderr. With `--format=json`, this must produce a JSON envelope on stdout instead.

**Decision**: Modify `Execute()` to check if `--format=json` was requested. If so, build an error envelope with code `command_failed` (or a more specific code if the error is a known typed error) and write it to stdout. If text mode, preserve existing stderr behavior.

For errors that occur *before* the format flag can be parsed (e.g., truly malformed command lines), fall back to the current stderr text behavior — this is acceptable because such errors mean the flag itself wasn't processable.

**Rationale**: This is the only place where Cobra-level errors (unknown command, flag parse errors) surface. It must be format-aware to satisfy FR-003 and SC-002.

**Alternatives considered**:
- Always write errors to stderr even in JSON mode — rejected; contradicts the clarification that JSON errors go to stdout (aws-cli convention).
- Wrap Cobra's error handler — Cobra doesn't expose a clean hook; overriding `Execute()` behavior is the standard approach.

---

## Summary

All technical unknowns resolved. No NEEDS CLARIFICATION items remain. Key decisions:

1. **Flag**: Persistent string on rootCmd, same pattern as `--context`
2. **Envelope**: `internal/output.Envelope` struct with `Data`, `Error`, `Warnings` fields
3. **Handler signature**: `RunFunc` returns `(any, error)` — factory handles serialization
4. **Error codes**: Flat snake_case strings, small initial taxonomy
5. **Centralized rendering**: All output goes through `factory.New()`'s RunE wrapper
