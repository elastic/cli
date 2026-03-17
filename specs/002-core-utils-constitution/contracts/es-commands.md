# CLI Command Contracts: `es` Family

**Branch**: `002-core-utils-constitution` | **Phase**: 1 | **Date**: 2026-03-17

These contracts define the public interface of each `es` subcommand after refactoring. They serve as the authoritative specification for flag names, error codes, dry-run behaviour, and output shapes.

---

## Common Behaviour (all `es` commands)

All `es` commands MUST:

1. Accept `--context` / `-c` (inherited from root) to override the active context.
2. Accept `--format` / `-f` (inherited from root): `table` | `json` | `csv` | `yaml`.
3. Accept `--dry-run` and exit 0 after printing the resolved request payload — no network call.
4. On error with `--format=json`, emit **only** the structured error JSON to stderr and exit non-zero.
5. Use `cmdutil.ResolveContext` for context resolution — no inline duplication permitted.
6. Use `cmdutil.HandleDryRun` — no inline dry-run guard permitted.
7. Use `cmdutil.RenderError` for all error output — no `fmt.Fprintf(stderr, ...)` for errors.

---

## `es indices list [name|pattern...]`

**Aliases**: `es idx ls`

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | bool | false | Validate inputs and print resolved request; exit 0, no network call |

### Dry-run output (JSON)

```json
{
  "dry_run": {
    "command": "elastic es indices list",
    "flags": {
      "context": "",
      "format": "table",
      "dry-run": "true"
    },
    "args": ["<pattern1>", "..."]
  }
}
```

### Success output

- **table**: Two columns: `name`, `attributes` (comma-separated).
- **json**: Array of `ResolveIndexItem` objects from the ES `resolve/index` API.
- **csv**: `name,attributes` rows.
- **yaml**: Same as json, YAML-encoded.

### Error codes

| Code | Trigger |
|------|---------|
| `config_not_found` | Config file absent |
| `no_context_selected` | No `--context` and no `current-context` set |
| `context_not_found` | Named context not in config |
| `internal_error` | Elasticsearch API error |

---

## `es data-streams list [name|pattern...]`

**Aliases**: `es ds ls`

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | bool | false | Validate inputs and print resolved request; exit 0, no network call |

### Success output

- **table**: `name`, `backing_indices` (count).
- **json/yaml**: Array of `ResolveDataStream` objects.

### Error codes

Same as `es indices list`.

---

## `es remote-clusters list [name|pattern...]`

**Aliases**: `es rc ls`

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | bool | false | Validate inputs and print resolved request; exit 0, no network call |

### Success output

- **table**: `name`, `connected`, `num_nodes_connected`.
- **json/yaml**: Map of cluster-name → `RemoteClusterInfo`.

### Error codes

Same as `es indices list`.

---

## `es cluster health`

**Aliases**: none

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | bool | false | Validate inputs and print resolved request; exit 0, no network call |

### Success output

- **table**: Cluster health fields (`cluster_name`, `status`, `number_of_nodes`, etc.).
- **json/yaml**: Full `ClusterHealthResponse` object.

### Error codes

Same as `es indices list`.

---

## `es query <query>`

**Aliases**: `es esql`

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | bool | false | Validate inputs and print resolved request; exit 0, no network call |
| `--null` | bool | false | Include null-only columns |
| `--wait` | []string | — | JMESPath wait conditions (repeatable) |
| `--interval` | duration | 1s | Poll interval (only with `--wait`) |
| `--timeout` | duration | 30s | Overall execution timeout |

### Dry-run output (JSON)

```json
{
  "dry_run": {
    "command": "elastic es query",
    "flags": {
      "context": "",
      "format": "table",
      "dry-run": "true",
      "null": "false",
      "timeout": "30s",
      "interval": "1s"
    },
    "args": ["FROM logs-* | LIMIT 10"]
  }
}
```

### Error codes

| Code | Trigger |
|------|---------|
| `config_not_found` | Config file absent |
| `no_context_selected` | No `--context` and no `current-context` |
| `context_not_found` | Named context not in config |
| `validation_error` | Empty query, invalid `--wait` expression, `--interval` without `--wait`, non-positive timeout |
| `internal_error` | Elasticsearch API error |

---

## Structured Error Envelope (all commands, `--format=json`)

```json
{
  "error": {
    "code": "<ErrCode constant value>",
    "message": "<human-readable description with remediation hint where applicable>"
  }
}
```

Exit code: non-zero for all error cases, `0` for success and dry-run success.
