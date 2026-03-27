# Quickstart: JSON Output Format

**Phase**: 1 | **Date**: 2026-03-27 | **Plan**: [plan.md](./plan.md)

## Basic Usage

```bash
# Default (text) — unchanged from current behavior
elastic version
# elastic version dev

# JSON output
elastic version --format=json
# {"data":"elastic version dev","error":null,"warnings":[]}
```

## Pipe to jq

```bash
elastic version --format=json | jq -r '.data'
# elastic version dev
```

## Error Handling

```bash
# Errors are also JSON on stdout (exit code is still 1)
elastic version --context=bogus --format=json
# {"data":null,"error":{"code":"context_not_found","message":"context \"bogus\" not found; no contexts are configured"},"warnings":[]}

# Extract error code in a script
code=$(elastic version --context=bogus --format=json | jq -r '.error.code')
echo "$code"   # context_not_found
```

## Scripting Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

output=$(elastic version --format=json)
error_code=$(echo "$output" | jq -r '.error.code // empty')

if [[ -n "$error_code" ]]; then
  echo "Failed: $error_code" >&2
  exit 1
fi

echo "Success: $(echo "$output" | jq -r '.data')"
```

## Unsupported Format

```bash
elastic version --format=xml
# Error: unsupported format "xml"; supported: text, json
# (exit code 1)

elastic version --format=xml --format=json
# Uses last value — not recommended; pass --format once
```

## Implementation Notes (for developers)

### Adding JSON support to a new command

No special action needed. If you use `factory.New()`, JSON output works automatically:

```go
factory.New("my-command", "Does a thing", func(ctx factory.RunContext) (any, error) {
    // Return data — the factory handles serialization
    return map[string]string{"result": "hello"}, nil
})
```

- `--format=json` → `{"data":{"result":"hello"},"error":null,"warnings":[]}`
- `--format=text` (default) → text rendering callback or `fmt.Fprintln`

### Returning errors

Just return an error as the second value. The factory converts it to a JSON error envelope automatically:

```go
return nil, fmt.Errorf("something went wrong")
// → {"data":null,"error":{"code":"command_failed","message":"something went wrong"},"warnings":[]}
```
