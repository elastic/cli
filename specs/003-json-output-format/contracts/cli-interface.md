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
# Output: {"data": "elastic version dev", "status": "ok"}
```

**Error Contract**:
```bash
# Unsupported format value
elastic version --format=xml
# Exit code: 1
# stderr: Error: unsupported format "xml"; supported: text, json

# JSON error output
elastic nonexistent-command --format=json
# Exit code: 1  
# stdout: {"error": {"code": "unknown_command", "message": "unknown command \"nonexistent-command\" for \"elastic\""}}
```

## Output Format Contracts

### Success Output - JSON Mode
**Structure**:
```json
{
  "data": <command_result>,
  "status": "ok"
}
```

**Examples**:
```json
// Simple string result
{"data": "elastic version dev", "status": "ok"}

// Complex object result (future commands)
{"data": {"cluster": "my-cluster", "version": "8.10.0"}, "status": "ok"}

// No meaningful data result
{"status": "ok"}
```

### Error Output - JSON Mode
**Structure**:
```json
{
  "error": {
    "code": "error_type",
    "message": "Human readable description"
  }
}
```

**Examples**:
```json
// Unknown command
{"error": {"code": "unknown_command", "message": "unknown command \"foo\" for \"elastic\""}}

// Invalid argument
{"error": {"code": "invalid_argument", "message": "required flag \"url\" not set"}}

// Network/service error
{"error": {"code": "connection_failed", "message": "failed to connect to https://localhost:9200"}}

// Config error  
{"error": {"code": "config_error", "message": "context \"nonexistent\" not found; available: local, prod"}}
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

**Text Mode**:
- Current behavior unchanged
- Human-readable formatting preserved

### Standard Error (stderr)
**JSON Mode**:
- Error JSON objects for command failures
- Diagnostic messages MAY be suppressed or redirected here
- Never mixed with stdout JSON

**Text Mode**:
- Current behavior unchanged
- Plain text error messages

### Exit Codes
**Both Modes**:
- 0: Success
- 1: Command error (invalid args, execution failure)
- Consistent between JSON and text modes

## Validation Contracts

### Format Flag Validation
```bash
# Valid values (case sensitive)
--format=text  ✓
--format=json  ✓

# Invalid values  
--format=TEXT  ✗ (case sensitive)
--format=xml   ✗ (unsupported)
--format=""    ✗ (empty)
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