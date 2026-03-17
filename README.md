# elastic

`elastic` is the CLI for Elastic.

## Prerequisites

- **Go 1.25+** — check with `go version`. The exact minimum is pinned in
  [`go.mod`](go.mod).
- **Docker** — only needed for functional tests (see below).

## Build

### Local development binary

Build a binary into the repo root (the path used by all Quickstart examples):

```bash
go build -o elastic ./cmd/elastic
```

### Install to `$GOPATH/bin`

```bash
go install ./cmd/elastic
```

### Release / optimised build

Strip debug info and symbol tables to produce a smaller binary, as CI does for
release assets:

```bash
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o elastic ./cmd/elastic
```

### Cross-compile

Set `GOOS` and `GOARCH` to target a different platform:

```bash
GOOS=darwin  GOARCH=arm64 go build -o elastic-darwin-arm64  ./cmd/elastic
GOOS=linux   GOARCH=amd64 go build -o elastic-linux-amd64   ./cmd/elastic
GOOS=windows GOARCH=amd64 go build -o elastic.exe            ./cmd/elastic
```

## Format and lint

### Format

All Go source must be formatted with `gofmt` before committing. Run it from the
repo root:

```bash
gofmt -w cmd/ internal/ tests/
```

Verify no files are still unformatted (should produce no output):

```bash
gofmt -l cmd/ internal/ tests/
```

### Vet

Run the standard Go static-analysis suite:

```bash
go vet ./...
```

Both checks are fast and have no external dependencies.

## Test

### Unit tests

Run all unit tests:

```bash
go test ./...
```

See [Go testing docs](https://pkg.go.dev/cmd/go#hdr-Testing_flags) for more options.

### Functional tests

Functional tests spin up a real Elasticsearch + Kibana stack via Docker and run
end-to-end smoke checks. They are gated behind the `functional` build tag so
they never run during a plain `go test ./...`.

Requirements: Docker daemon running locally.

```bash
go test -tags functional ./tests/functional -v
```

### Agentic scenario tests

Agentic tests drive an AI agent session against the local stack and are opt-in,
gated by the `ELASTIC_AGENTIC_TESTS=1` environment variable. They use the
[GitHub Copilot SDK](https://github.com/github/copilot-sdk).

Requirements: `copilot` CLI in `PATH` (or set `ELASTIC_AGENTIC_COPILOT_CLI` to
an explicit path), Docker daemon running, and a `COPILOT_GITHUB_TOKEN` with
appropriate scopes.

```bash
ELASTIC_AGENTIC_TESTS=1 go test ./tests/agentic -v
```

Scenarios live in `tests/agentic/scenarios/` and harness code in
`tests/agentic/harness/`.

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

Or use basic auth vs an API key:

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
./elastic kb dashboard schema -f json
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
