# Contract: Structured Error Output

**Type**: CLI output contract (JSON serialisation)
**Consumers**: Automation agents, CI pipelines, shell scripts parsing `--format=json` output
**Stability**: Stable (breaking changes require a MAJOR constitution version bump)

---

## Error Response Shape

Any command that produces an error **MUST** emit the following JSON when `--format=json` is active:

```json
{
  "error": {
    "code": "<ErrCode constant>",
    "message": "<human-readable string>"
  }
}
```

### Field constraints

| Field | Type | Constraints |
|-------|------|-------------|
| `error.code` | string | Non-empty; one of the defined `ErrCode*` constants |
| `error.message` | string | Non-empty; human-readable; MAY include a remediation hint |

### Exit codes

| Condition | Exit code |
|-----------|-----------|
| Success | 0 |
| Any error (including structured) | Non-zero (1) |
| Dry-run success | 0 |

---

## Defined Error Codes

See [`cmdutil-api.md`](./cmdutil-api.md#error-code-constants) for the canonical list of
`ErrCode*` constants, their string values, and trigger conditions.

---

## Dry-Run Response Shape (JSON)

When a command is invoked with `--dry-run --format=json` and inputs are valid:

```json
{
  "dry_run": {
    "command": "<cobra command Use string>",
    "flags": {
      "<flag-name>": "<resolved-value>"
    }
  }
}
```

> **Note:** Commands with positional arguments (e.g. `es raw`) handle dry-run
> output themselves and emit a command-specific shape rather than this generic one.

Exit code: **0**

When inputs are invalid under `--dry-run --format=json`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "<description of the invalid input>"
  }
}
```

Exit code: **non-zero**

---

## Non-JSON (human) Error Format

When `--format=json` is **not** active, errors are printed to **stderr** as a plain string:

```
Error: <message>
```

(Emitted by the existing `Execute()` function in `cmd/root.go` — no change required.)

---

## Backward Compatibility

- The `error` wrapper key and `code`/`message` sub-fields are **frozen**; renaming or removing them is a breaking change.
- Adding new `ErrCode*` constants is a non-breaking minor change.
- Adding optional sibling keys to the `error` object (e.g. `"details"`) is a non-breaking minor change, provided existing keys remain.
