# ES|QL

The `elastic es query` command runs an ES|QL query against the selected Elasticsearch endpoint.

## Usage

```bash
elastic es query '<query>'
```

Examples:

```bash
elastic es query 'FROM logs-* | LIMIT 5'
elastic es query 'FROM logs-* | WHERE @timestamp > NOW() - 1 hour | LIMIT 10'
elastic es query 'FROM metrics-* | STATS avg_cpu = AVG(system.cpu.total.pct) BY host.name | SORT avg_cpu DESC | LIMIT 10'
elastic es query --wait 'length(values) > `0`' --interval 1s --timeout 30s 'FROM logs-* | LIMIT 1'
```

## Selecting a context

Use the active context:

```bash
elastic config context use prod
elastic es query 'FROM logs-* | LIMIT 5'
```

Override per invocation:

```bash
elastic es query -c staging 'FROM logs-* | LIMIT 5'
```

## Output formats

Use `--format` / `-f` (or `--output` as an alias):

- `table` (default): terminal table
- `json`: pretty-printed JSON response
- `csv`: CSV with a header row
- `yaml`: YAML list of records

Examples:

```bash
elastic es query -f table 'FROM logs-* | LIMIT 5'
elastic es query -f json  'FROM logs-* | LIMIT 1'
elastic es query -f csv   'FROM logs-* | LIMIT 10'
elastic es query -f yaml  'FROM logs-* | LIMIT 5'
```

## Null handling

By default, columns where every value is null are omitted from the output. To include them, pass `--null`:

```bash
elastic es query --null 'FROM logs-* | LIMIT 5'
```

## Waiting for conditions

Use one or more `--wait` flags to poll until all JMESPath expressions evaluate to `true` against the JSON ES|QL response.

```bash
elastic es query --wait 'length(values) > `0`' --interval 1s --timeout 30s 'FROM logs-* | LIMIT 1'
```

- `--wait`: repeatable condition expression
- `--interval`: polling interval while waiting (only valid with `--wait`)
- `--timeout`: overall timeout for both one-shot queries and wait polling
