# Data Model: Core Utilities — Constitutional Foundations

**Branch**: `002-core-utils-constitution` | **Phase**: 1 | **Date**: 2026-03-17

---

## Entities

### 1. `StructuredError`

**Package**: `internal/cmdutil`

| Field | Type | Description |
|-------|------|-------------|
| `Code` | `string` | Machine-readable error code. MUST be one of the exported constants. |
| `Message` | `string` | Human-readable description of the error. |

**Constraints**:
- Implements the `error` interface (`Error() string` returns `Message`).
- Serializes to `{"error":{"code":"<Code>","message":"<Message>"}}` under `--format=json`.
- The `NewStructuredError` constructor is idempotent: if the input `error` is already a `*StructuredError`, it is returned unchanged.

**State transitions**: None (value type).

**Validation rules**:
- `Code` MUST be non-empty.
- `Code` MUST be one of the defined constant values (enforced by convention; not a runtime type constraint).

---

### 2. Error Code Constants

**Package**: `internal/cmdutil`

| Constant | Value | Use case |
|----------|-------|----------|
| `ErrCodeValidation` | `"validation_error"` | Input failed schema/flag validation |
| `ErrCodeConfigNotFound` | `"config_not_found"` | Config file does not exist on disk |
| `ErrCodeContextNotFound` | `"context_not_found"` | Named context absent from config |
| `ErrCodeNoContextSelected` | `"no_context_selected"` | No current-context set and no `--context` flag |
| `ErrCodeDryRunNotSupported` | `"dry_run_not_supported"` | `--dry-run` passed to a command that doesn't register it |
| `ErrCodeInternal` | `"internal_error"` | Unexpected/unclassified internal failure |

---

### 3. `ResolvedContext`

**Package**: `internal/cmdutil` (re-exported from `config.Context`)

`ResolvedContext` is a type alias for `config.Context`. It represents the fully-validated connection configuration ready for client construction. No additional fields; the alias exists to document intent and provide a stable public name for the utility's return type.

| Field | Type | Source |
|-------|------|--------|
| `CloudID` | `string` | `config.Context.CloudID` |
| `APIKey` | `string` | `config.Context.APIKey` |
| `Username` | `string` | `config.Context.Username` |
| `Password` | `string` | `config.Context.Password` |
| `ElasticsearchURL` | `string` | `config.Context.ElasticsearchURL` |
| `KibanaURL` | `string` | `config.Context.KibanaURL` |

---

### 4. `DryRunOutput`

Not a struct — the dry-run utility derives its output from the command's declared flags at runtime via `cmd.Flags().VisitAll`. No per-command type is defined.

**JSON shape** (when `--format=json`):
```json
{
  "dry_run": {
    "command": "<cmd.CommandPath()>",
    "flags": {
      "<flag-name>": "<flag-value-string>"
    }
  }
}
```

**Table/text shape**:
```
Dry run: <cmd.CommandPath()>
  --<flag>  <value>
  ...
```

---

## Relationships

```
cmd (es family)
  └─ calls cmdutil.ResolveContext(cfgPath, ctxFlag)
       └─ returns config.Context (ResolvedContext) | *StructuredError
  └─ calls cmdutil.HandleDryRun(cmd, format)
       └─ prints DryRunOutput | returns *StructuredError
  └─ on error: calls cmdutil.RenderError(w, format, err)
       └─ writes {"error":{...}} (JSON) or plain string (other)
```

---

## State Transitions

### Context resolution

```
[cfgPath provided]
    │
    ▼
os.Stat(cfgPath) ──── missing ──► StructuredError{ErrCodeConfigNotFound}
    │
   exists
    │
    ▼
config.Load(cfgPath) ──── error ──► StructuredError{ErrCodeInternal}
    │
   ok
    │
    ▼
resolve ctxName (flag or CurrentContext)
    │
    ├── empty ──────────────────► StructuredError{ErrCodeNoContextSelected}
    │
    ▼
cfg.Contexts[ctxName]
    │
    ├── not found ──────────────► StructuredError{ErrCodeContextNotFound}
    │
    ▼
ResolvedContext (success)
```

### Dry-run handling

```
HandleDryRun(cmd, format)
    │
    ▼
cmd.Flags().Lookup("dry-run") == nil?
    ├── yes, and --dry-run somehow set ──► StructuredError{ErrCodeDryRunNotSupported}
    │
    ▼
flag "dry-run" changed?
    ├── no ──────────────────────────────► (false, nil) — caller continues normally
    │
    ▼
collect flags via VisitAll
    │
    ▼
render DryRunOutput (json or text)
    │
    ▼
(true, nil) — caller returns nil
```
