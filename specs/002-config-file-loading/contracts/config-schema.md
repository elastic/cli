# Contract: Configuration File Schema

**Date**: 2026-03-30
**Feature**: 002-config-file-loading
**Type**: CLI configuration file format (YAML)

## Overview

This contract defines the structure of the Elastic CLI configuration file, discovered by cosmiconfig with application ID `elastic`. The primary expected filename is `.elasticrc.yml`.

## File Format

- **Format**: YAML
- **Encoding**: UTF-8
- **Discovery**: cosmiconfig default search (CWD upward, then home directory)
- **Override**: `--config <path>` CLI flag bypasses discovery

## Schema

### Root Object

```yaml
# Required. Name of the default active context.
current-context: <string>

# Required. Map of context definitions (minimum 1 entry).
# Keys are the unique context names.
contexts:
  <name>: <Context>
```

### Context Object

```yaml
# Optional. At least one service block must be present.
elasticsearch: <ServiceBlock>
kibana: <ServiceBlock>
cloud: <ServiceBlock>
```

### ServiceBlock Object

```yaml
# Required. Endpoint URL for the service.
url: <string>

# Required. Authentication credentials.
auth: <Auth>
```

### Auth Object (discriminated union on `type`)

#### API Key variant

```yaml
type: apiKey
apiKey: <string>
```

#### Basic (username/password) variant

```yaml
type: basic
username: <string>
password: <string>
```

## Validation Behavior

| Condition | Result |
|-----------|--------|
| Valid file with all required fields | Config loaded successfully |
| Unknown/extra fields at any level | Silently ignored |
| Missing `current-context` | Validation error listing missing field |
| Missing `contexts` or empty object `{}` | Validation error listing missing field |
| `current-context` references nonexistent context key | Error: context not found |
| Context with zero service blocks | Validation error: at least one service required |
| Auth block missing `type` field or invalid `type` | Validation error with field path |
| Empty file (valid YAML, no content) | Validation error: missing required fields |
| Invalid YAML syntax | Parse error with line/column if available |
| File not readable (permissions) | OS-level error surfaced with file path |

## CLI Flag Overrides

| Flag | Effect |
|------|--------|
| `--config <path>` | Use specified file instead of cosmiconfig discovery |
| `--context <name>` | Override `current-context` for this invocation |

## Resolved Output

After loading and resolution, the command handler receives a `ResolvedConfig` object containing only the active context's service blocks. No other contexts are visible.

```typescript
interface ResolvedConfig {
  context: {
    elasticsearch?: { url: string; auth: Auth }
    kibana?: { url: string; auth: Auth }
    cloud?: { url: string; auth: Auth }
  }
}
```
