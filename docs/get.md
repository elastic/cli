# Resource Listing

Resource listing commands are grouped by product area.

## Elasticsearch resources

Usage:

```bash
elastic es <resource> list [name|pattern...]
```

Resources:

- `indices` (alias: `idx`)
- `data-streams` (alias: `ds`)
- `remote-clusters` (alias: `rc`)
- `cluster health` (`elastic es cluster health`)

Examples:

```bash
elastic es indices list
elastic es data-streams list
elastic es remote-clusters list
elastic es cluster health
```

Filter by name or glob pattern:

```bash
elastic es indices list 'logs-*'
elastic es data-streams list 'metrics-*'
elastic es rc list 'cluster-*'
```

Multiple patterns are supported:

```bash
elastic es indices list 'logs-*' 'metrics-*'
```

## SLO resources

SLO commands are grouped under `slos`:

```bash
elastic slos list [name|pattern...]
elastic slos list-definitions [name|pattern...]
```

> Note: `elastic slos list` and `elastic slos list-definitions` query Kibana APIs. If `kibana_url` is not set, `elastic` derives it from `cloud_id` (preferred) or from an Elastic Cloud-style `elasticsearch_url` when possible.

## Selecting a context

Use the active context:

```bash
elastic config context use prod
elastic es indices list
```

Override per invocation:

```bash
elastic -c staging es indices list
```

## Output formats

Use `--format` / `-f` (or `--output` as an alias):

- `table` (default): terminal table
- `json`: pretty-printed JSON response
- `csv`: CSV with a header row
- `yaml`: YAML output

```bash
elastic es indices list -f json
elastic es data-streams list -f csv
elastic slos list -f yaml
```
