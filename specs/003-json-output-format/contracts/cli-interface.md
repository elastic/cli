# CLI Interface Contract: JSON Output Format

**Phase**: 1 | **Date**: 2026-03-27 | **Plan**: [../plan.md](../plan.md)

## Global Flag Contract

### --format Flag
**Syntax**: `--format=<value>`
**Values**: `text` (default) | `json`
**Scope**: Available on ALL commands (inherited via PersistentFlags)

**Behavior Contract**:
```bash
# Text output (current behavior, unchanged)
elastic version
# Output: elastic version dev

# JSON output (new behavior)
elastic version --format=json
# Output: {"data":"elastic version dev","error":null,"warnings":[]}
```

**Error Contract**:
```bash
# Unsupported format value — invalid_argument envelope written to stdout, exit 0
elastic version --format=xml
# Exit code: 0
# stdout: {"data":null,"error":{"code":"invalid_argument","message":"unsupported format \"xml\": supported values are \"text\" and \"json\""},"warnings":[]}

# JSON error output for Cobra-level failures (unknown command)
elastic nonexistent-command --format=json
# Exit code: 1
# stdout: {"data":null,"error":{"code":"unknown_command","message":"unknown command \"nonexistent-command\" for \"elastic\""},"warnings":[]}
```

## Output Format Contracts

### Success Output - JSON Mode
**Structure**:
```json
{
  "data": <command_result>,
  "error": null,
  "warnings": []
}
```

**Examples**:
```json
// Simple string result
{"data": "elastic version dev", "error": null, "warnings": []}

// Complex object result (future commands)
{"data": {"cluster": "my-cluster", "version": "8.10.0"}, "error": null, "warnings": []}

// No meaningful data result
{"data": null, "error": null, "warnings": []}
```

### Error Output - JSON Mode
**Structure**:
```json
{
  "data": null,
  "error": {
    "code": "error_type",
    "message": "Human readable description"
  },
  "warnings": []
}
```

**Examples**:
```json
// Unknown / Cobra-level command error
// Unrecognized subcommand
{"data": null, "error": {"code": "unknown_command", "message": "unknown command \"foo\" for \"elastic\""}, "warnings": []}

// Invalid argument
{"data": null, "error": {"code": "invalid_argument", "message": "unsupported format \"xml\": supported values are \"text\" and \"json\""}, "warnings": []}

// Network/service error
{"data": null, "error": {"code": "command_failed", "message": "failed to connect to https://localhost:9200"}, "warnings": []}

// Config error
{"data": null, "error": {"code": "config_error", "message": "read config /home/user/.config/elastic/config.yml: permission denied"}, "warnings": []}

// Context not found
{"data": null, "error": {"code": "context_not_found", "message": "context \"nonexistent\" not found; available: local, prod"}, "warnings": []}
```

### Success Output - Text Mode (Default)
**Behavior**: Exactly as current implementation
**No Changes**: Preserves all existing human-readable formatting

### Error Output - Text Mode (Default)
**Behavior**: Exactly as current implementation
**Format**: `Error: <message>` to stderr

## Stream Contracts

### Standard Output (stdout)
**JSON Mode**:
- ONLY valid JSON objects
- No banners, progress indicators, or diagnostic messages
- Single JSON object per command execution
- Both success and error responses written here

**Text Mode**:
- Current behavior unchanged
- Human-readable formatting preserved

### Standard Error (stderr)
**JSON Mode**:
- Always empty — all output (including errors) goes to stdout as a JSON envelope

**Text Mode**:
- Current behavior unchanged
- Plain text error messages (`Error: <message>`)

### Exit Codes
**Both Modes**:
- 0: Success (including invalid `--format` value — error written to stdout as JSON)
- 1: Command error (invalid args handled by Cobra, execution failure)
- Consistent between JSON and text modes for Cobra-level errors

## Validation Contracts

### Format Flag Validation
```bash
# Valid values (case sensitive)
--format=text  ✓
--format=json  ✓

# Invalid values — rendered as JSON error envelope to stdout, exit 0
--format=TEXT  ✗
--format=xml   ✗

# Empty value — silently treated as text mode (default)
--format=""    treated as --format=text
```

### JSON Output Validation
**Requirements**:
1. Must pass `json.Valid()` check
2. Must parse with `jq` without errors
3. No ANSI escape codes or control characters
4. Single JSON object (not array or multiple objects)
5. UTF-8 encoding

### Pipeline Compatibility
**Test Contract**:
```bash
# Must work without errors
elastic version --format=json | jq .
elastic some-command --format=json | jq '.data'
elastic failing-command --format=json | jq '.error.code'
```

## Help Output Contract

### JSON Schema Support (Future)
**Planned Contract**:
```bash
elastic version --help --format=json
# Should return JSON schema for the command
```

**Not Implemented**: In initial version, `--help` ignores `--format` flag

## Backward Compatibility

### Existing Behavior
**Guarantee**: NO changes to default behavior
- Commands without `--format` work exactly as before
- All existing scripts and integrations unaffected

### Migration Path
**Recommendation**: Users can adopt `--format=json` incrementally
- Per-command adoption supported
- Mixed pipelines work (some commands with/without flag)
