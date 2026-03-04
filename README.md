# elastic

`elastic` is the CLI for Elastic.

## Install / Build

From the repo root:

```bash
go install ./cmd/elastic
```

## Configuration

`elastic` stores its config in the OS-appropriate per-user config directory (via Go's `os.UserConfigDir()`):

- **Linux**: `$XDG_CONFIG_HOME/elastic/config.yaml` (fallback `~/.config/elastic/config.yaml`)
- **macOS**: `~/Library/Application Support/elastic/config.yaml`
- **Windows**: `%AppData%\\elastic\\config.yaml`

On first run, `elastic` will create this file if it does not exist, including a commented-out example configuration.

### Manual migration from older locations

If you previously used `~/.elastic/config.yaml` (or an older `~/.elk/config.yaml`), copy it into the new location above.

## Quickstart

### 1) Create a context

```bash
./elastic config context set prod \
  --cloud-id 'my-deploy:...' \
  --api-key '...'
```

Or use basic auth instead of an API key:

```bash
./elastic config context set prod \
  --cloud-id 'my-deploy:...' \
  --username 'elastic' \
  --password '...'
```

Or use a direct Elasticsearch URL (self-managed or custom endpoint):

```bash
./elastic config context set local \
  --elasticsearch-url 'https://localhost:9200' \
  --api-key '...'
```

### 2) Select the active context

```bash
./elastic config context use prod
./elastic config context list
```

### 3) Run an ES|QL query

```bash
./elastic es query 'FROM logs-* | LIMIT 5'
./elastic es query --wait 'length(values) > `0`' --interval 1s --timeout 30s 'FROM logs-* | LIMIT 1'
```

Output formats:

```bash
./elastic es query -f table 'FROM logs-* | LIMIT 5'
./elastic es query -f json  'FROM logs-* | LIMIT 1'
./elastic es query -f csv   'FROM logs-* | LIMIT 10'
./elastic es query -f yaml  'FROM logs-* | LIMIT 5'
```

By default, columns where every value is null are omitted. To include them:

```bash
./elastic es query --null 'FROM logs-* | LIMIT 5'
```

### 4) List resources

```bash
./elastic es indices list
./elastic es data-streams list
./elastic es remote-clusters list
./elastic es cluster health
./elastic slos list
./elastic slos list-definitions
```

### 5) Check Kibana task manager health

```bash
./elastic kb task-manager health
./elastic kb task-manager health -f json
```

### 6) Manage Kibana dashboards

```bash
./elastic kb dashboard list
./elastic kb dashboard list "APM"
./elastic kb dashboard get <id>
./elastic kb dashboard create --title "My Dashboard"
./elastic kb dashboard delete <id>
```

### 7) Search and read Elastic documentation

```bash
./elastic docs search "elasticsearch getting started"
./elastic docs read /reference/elasticsearch
./elastic docs read "ingest pipelines"
./elastic docs ask "What is Elasticsearch?"
```

Filter by name or glob pattern:

```bash
./elastic es indices list 'logs-*'
./elastic es data-streams list 'metrics-*'
```

Short aliases work too (`cfg`, `idx`, `ds`, `rc`):

```bash
./elastic cfg context list
./elastic es ds list
./elastic es rc list
```

## Docs

- [`docs/config.md`](docs/config.md)
- [`docs/auth.md`](docs/auth.md) — future OAuth2 / UIAM authentication
- [`docs/api.md`](docs/api.md)
- [`docs/esql.md`](docs/esql.md)
- [`docs/get.md`](docs/get.md)
- [`docs/kb.md`](docs/kb.md) — Kibana commands (`task-manager`, `dashboard`)
- [`docs/docs.md`](docs/docs.md) — Elastic documentation commands (`search`, `read`, `ask`)

## Functional tests

Run the docker-compose functional smoke test suite with:

```bash
go test -tags functional ./tests/functional -v
```
