# Data Model: JSON Output Format Flag

**Phase**: 1 | **Date**: 2026-03-27 | **Plan**: [plan.md](./plan.md)

## Entities

### Envelope

The top-level JSON response structure emitted on stdout when `--format=json` is active.

**Package**: `internal/output`

| Field | Type | JSON key | Nullable | Description |
|-------|------|----------|----------|-------------|
| Data | `any` | `data` | Yes (null when error) | Command result payload. Type varies per command. |
| Error | `*Error` | `error` | Yes (null on success) | Structured error when the command fails. |
| Warnings | `[]string` | `warnings` | No (empty `[]`, never null) | Diagnostic warnings collected during execution. |

**Validation rules**:
- Exactly one of `Data` or `Error` is non-null. Both null and both non-null are programming errors.
- `Warnings` is always initialized to `[]string{}` so JSON output is `[]` not `null`.
- The entire struct must produce valid JSON via `json.Marshal` with no error.

**State transitions**: Immutable after construction. Built once by the factory after the handler returns, then serialized and discarded.

---

### Error

A structured error value embedded in the Envelope.

**Package**: `internal/output`

| Field | Type | JSON key | Required | Description |
|-------|------|----------|----------|-------------|
| Code | `string` | `code` | Yes | Machine-readable snake_case error identifier. |
| Message | `string` | `message` | Yes | Human-readable error description. |

**Validation rules**:
- `Code` must be non-empty.
- `Message` must be non-empty.
- Both must be plain UTF-8 text (no ANSI codes, no control characters).

**Known codes** (initial set):

| Code | Trigger |
|------|---------|
| `unknown_command` | Unrecognized subcommand |
| `invalid_argument` | Flag validation failure, unsupported `--format` value |
| `config_error` | Config file unreadable/unparseable |
| `context_not_found` | `--context` references unknown context |
| `input_error` | `--file`/stdin read error, or both provided |
| `command_failed` | Generic handler error (fallback code) |

---

### RunContext (extended)

Existing struct in `internal/factory`. No new fields are added to RunContext itself — format resolution is handled by the factory wrapper, not exposed to handlers.

**Rationale**: Handlers should not know about output format. They return data; the factory renders it. This prevents handlers from conditionally branching on format, which would defeat centralized control.

---

### RunFunc (signature change)

**Current**: `type RunFunc func(ctx RunContext) error`
**New**: `type RunFunc func(ctx RunContext) (any, error)`

The first return value is the data payload for the Envelope. Returning `nil, nil` produces `{"data": null, "error": null, "warnings": []}` (used for commands with no meaningful output, though `{"status": "ok"}` is preferred per FR-007).

---

### Format (value object)

Represents the resolved output format. Not a separate struct — just a validated string constant.

**Package**: `internal/output`

| Constant | Value | Description |
|----------|-------|-------------|
| `FormatText` | `"text"` | Default human-readable output. |
| `FormatJSON` | `"json"` | JSON envelope output. |

**Validation**: `ValidateFormat(s string) error` returns nil for known values, error listing supported formats otherwise.

## Relationships

```
rootCmd
  └── PersistentFlags: --format (string, default "text")

factory.New() RunE wrapper
  ├── reads --format from root flags
  ├── validates format value via output.ValidateFormat()
  ├── calls RunFunc handler → (data any, err error)
  ├── builds output.Envelope{Data: data, Error: err, Warnings: warnings}
  └── calls output.Render(envelope, format, writer)

output.Render()
  ├── format == "json" → json.Marshal(envelope) + "\n" → stdout
  └── format == "text" → text callback or fmt.Fprintln → stdout

cmd.Execute()
  ├── err == nil → normal exit
  └── err != nil
      ├── format == "json" → output.RenderError(err) → stdout, exit 1
      └── format == "text" → fmt.Fprintf(stderr, "Error: %s\n") → exit 1
```
