# CLI Contract: JSON Envelope

**Phase**: 1 | **Date**: 2026-03-27 | **Plan**: [../plan.md](../plan.md)

## Global Flag

```
--format=<value>    Output format. Supported: text (default), json.
```

Registered as a PersistentFlag on the root command. Inherited by all subcommands.

## Envelope Schema

Every command response when `--format=json` is active conforms to this structure:

```json
{
  "data": <any | null>,
  "error": <ErrorObject | null>,
  "warnings": [<string>, ...]
}
```

### Success (exit 0)

```json
{
  "data": "elastic version dev",
  "error": null,
  "warnings": []
}
```

### Success with warnings (exit 0)

```json
{
  "data": {"cluster_name": "my-cluster"},
  "error": null,
  "warnings": ["API key expires in 3 days"]
}
```

### Success with no meaningful output (exit 0)

```json
{
  "data": {"status": "ok"},
  "error": null,
  "warnings": []
}
```

### Error (exit 1)

```json
{
  "data": null,
  "error": {"code": "context_not_found", "message": "context \"bogus\" not found; available: prod, staging"},
  "warnings": []
}
```

## ErrorObject Schema

```json
{
  "code": "<snake_case_error_code>",
  "message": "<human-readable description>"
}
```

Both fields are always present and non-empty.

### Error Codes (initial set)

| Code | Description | Example trigger |
|------|-------------|-----------------|
| `unknown_command` | Unrecognized subcommand | `elastic bogus --format=json` |
| `invalid_argument` | Flag validation failure | `elastic version --format=xml` |
| `config_error` | Config unreadable or malformed | Permission denied on config file |
| `context_not_found` | `--context` names missing context | `elastic version --context=nope` |
| `input_error` | Input read failure | `--file` path doesn't exist |
| `command_failed` | Generic handler error | Network timeout, unexpected failure |

## Stream Contract

| Stream | `--format=json` | `--format=text` (default) |
|--------|-----------------|--------------------------|
| stdout | Single JSON envelope (success or error) | Human-readable text (current behavior) |
| stderr | Empty (nothing written) | `Error: <message>\n` on failure |

## Validation Contract

```
--format=json   ✓  Recognized
--format=text   ✓  Recognized (default behavior)
--format=xml    ✗  Exit 1, error: "unsupported format \"xml\"; supported: text, json"
--format=JSON   ✗  Exit 1 (case-sensitive)
--format=""     ✗  Exit 1, treated as unsupported value
```

When `--format` is not provided at all, default is `text`.

## Pipeline Contract

```bash
# All of these must succeed without parse errors:
elastic version --format=json | jq .
elastic version --format=json | jq -r '.data'
elastic version --format=json | python3 -c 'import json,sys; json.load(sys.stdin)'

# Error responses are also valid JSON:
elastic bogus --format=json 2>/dev/null | jq -r '.error.code'
```

## Backward Compatibility

- Commands invoked without `--format` produce identical output to current behavior.
- No existing flags or behaviors are modified.
- Exit codes are preserved: 0 for success, 1 for error (same in both formats).
