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
  "data": null,
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
| `command_failed` | Generic handler error (network timeout, unexpected failure) | Handler returns an error |
| `invalid_argument` | Flag value not supported or unknown flag | `elastic version --format=xml`; `elastic version --bogus-flag` |
| `config_error` | Config unreadable or malformed | Permission denied on config file |
| `context_not_found` | `--context` names missing context | `elastic version --context=nope` |
| `input_error` | Input read failure | `--file` path doesn't exist |

## Stream Contract

| Stream | `--format=json` | `--format=text` (default) |
|--------|-----------------|--------------------------|
| stdout | Single JSON envelope (success or error) | Human-readable text (current behavior) |
| stderr | Always empty | `Error: <message>\n` on failure |

## Validation Contract

```
--format=json   ✓  Recognized
--format=text   ✓  Recognized (default behavior)
--format=xml    ✗  Exit 0, stdout JSON: {"data":null,"error":{"code":"invalid_argument","message":"unsupported format \"xml\": supported values are \"text\" and \"json\""},"warnings":[]}
--format=JSON   ✗  Same as above (case-sensitive)
--format=""         Silently treated as --format=text (default)
```

When `--format` is not provided at all, default is `text`.

## Pipeline Contract

```bash
# All of these must succeed without parse errors:
elastic version --format=json | jq .
elastic version --format=json | jq -r '.data'
elastic version --format=json | python3 -c 'import json,sys; json.load(sys.stdin)'

# Error responses are also valid JSON (note: no stderr redirection needed):
elastic bogus --format=json | jq -r '.error.code'
# prints: unknown_command
```

## Backward Compatibility

- Commands invoked without `--format` produce identical output to current behavior.
- No existing flags or behaviors are modified.
- Exit codes are preserved: 0 for success, 1 for error (same in both formats).
