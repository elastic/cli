# Elastic CLI

## :warning: the `mvp` branch is a work in progress starting from scratch, not a finished tool

Interact with Elasticsearch, Elastic Serverless and Elastic Cloud APIs from the command line.

## Installation

This CLI is not yet available on npm.
To install it, clone the repository, install dependencies, build and link:

```bash
git clone git@github.com:elastic/cli.git
cd cli
npm install
npm run build
npm link
```

Then you should be able to run `elastic` commands:

```bash
elastic --help
```

## Configuration

The CLI searches for a config file starting from the current working directory and
walks up toward your home directory, stopping at the first file found. As a final
fallback it also checks the platform-specific user config directory
(`~/.config/elastic/` on Linux/macOS, `%APPDATA%\elastic\` on Windows).

The following file names are recognised in each directory (checked in this order):

1. `package.json` — `elastic` key
2. `.elasticrc`
3. `.elasticrc.json`
4. `.elasticrc.yaml`
5. `.elasticrc.yml`
6. `.elasticrc.js` / `.elasticrc.ts` / `.elasticrc.cjs` / `.elasticrc.mjs`
7. `.config/elasticrc` (and `.json` / `.yaml` / `.yml` / `.js` / `.ts` / `.cjs` / `.mjs` variants)
8. `elastic.config.js` / `.ts` / `.cjs` / `.mjs`

**Only the first matching file is used — configs are not merged.** Place your
personal config at `~/.elasticrc.yml` (recommended) so it applies everywhere, or
put one in a project root to override it for that project.

```yaml
current_context: local

contexts:
  local:
    elasticsearch:
      url: https://localhost:9200
      auth:
        api_key: your-api-key-here
  staging:
    elasticsearch:
      url: https://my-cluster.es.us-east-1.aws.elastic.cloud
      auth:
        api_key: your-api-key-here
    cloud:
      url: https://api.elastic-cloud.com
      auth:
        api_key: your-cloud-api-key-here
```

Multiple contexts are supported.
Override `current_context` for a single command with `--use-context <name>`.

Each context can have any combination of service blocks (`elasticsearch`, `kibana`, `cloud`).
Authentication can also use `username` + `password` instead of `api_key`.

## Global options

| Option | Description |
|---|---|
| `--config-file <path>` | Path to a config file, bypassing automatic discovery |
| `--use-context <name>` | Override the active context from the config file |
| `--json` | Output results as JSON |

## Commands

### `version`

Print the CLI version.

```bash
elastic version
elastic --json version
```

### `es` — Elasticsearch API

Run Elasticsearch API calls. Commands map directly to Elasticsearch API endpoints.

```bash
elastic es --help
```

All `es` subcommands support:

| Option | Description |
|---|---|
| `--dry-run` | Validate inputs and exit without making any API call |
| `--input-file <path>` | Load command input from a JSON file instead of CLI flags |

**Subcommand groups** (each with their own subcommands):

- `async-search` — async search APIs
- `cat` — cat APIs
- `cluster` — cluster management
- `connector` — connector management
- `enrich` — enrich policies
- `eql` — EQL search
- `esql` — ES|QL queries
- `indices` — index management
- `inference` — inference endpoints
- `ingest` — ingest pipelines
- `license` — license management
- `logstash` — Logstash pipelines
- `ml` — machine learning
- `project` — project management
- `query-rules` — query rules
- `search-application` — search applications
- `security` — security APIs
- `sql` — SQL queries
- `synonyms` — synonym sets
- `tasks` — task management
- `transform` — transforms

**Top-level `es` commands** (examples):

```bash
elastic es search --index my-index
elastic es get --index my-index --id abc123
elastic es index --index my-index --id abc123
elastic es delete --index my-index --id abc123
elastic es count --index my-index
elastic es info
elastic es bulk
elastic es reindex
elastic es update --index my-index --id abc123
```

Run `elastic es <command> --help` for all available options on any command.

### `cloud` — Elastic Cloud control plane

Manage Elastic Cloud deployments and Elasticsearch serverless projects.
Requires a `cloud` service block in the active context.

#### `cloud deployments`

```bash
elastic cloud deployments list
elastic cloud deployments get --deployment-id <id>
elastic cloud deployments shutdown --deployment-id <id>
```

#### `cloud projects`

```bash
elastic cloud projects list
elastic cloud projects get --project-id <id>
elastic cloud projects delete --project-id <id>
```
