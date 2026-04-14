# Elastic CLI

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

The CLI looks for a config file in your home directory. The following file names
are checked (in this order):

1. `.elasticrc`
2. `.elasticrc.json`
3. `.elasticrc.yaml`
4. `.elasticrc.yml`

Place your config at `~/.elasticrc.yml` (recommended).

To use a config file in a different location, pass `--config-file <path>` or set
the `ELASTIC_CLI_CONFIG_FILE` environment variable. The flag takes precedence
over the environment variable.

```yaml
current_context: local

contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
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

### External credentials

Instead of storing secrets in plaintext, any string value in the config file can
use `$(resolver:params)` expressions to fetch values from external sources at
runtime.

#### `file` - read from a file

Reads the contents of a file (trimmed). Useful for Docker/Kubernetes secrets
mounted at `/run/secrets/`.

```yaml
auth:
  api_key: $(file:/run/secrets/elastic_api_key)
```

#### `env` - environment variables

```yaml
auth:
  api_key: $(env:ELASTIC_API_KEY)
```

#### `cmd` - shell command output

The command is executed and its stdout (trimmed) is used as the value.

```yaml
auth:
  api_key: $(cmd:pass show elastic/api-key)
```

#### `keychain` - macOS Keychain (macOS only)

Reads a password from the macOS Keychain using the `service/account` format.

```yaml
auth:
  api_key: $(keychain:elastic-cli/api-key)
```

To store a value: `security add-generic-password -s elastic-cli -a api-key -w`

Expressions can appear in any string field, including URLs:

```yaml
elasticsearch:
  url: https://$(env:ES_HOST):9200
  auth:
    api_key: $(keychain:elastic-cli/api-key)
```

## Global options

| Option | Description |
|---|---|
| `--config-file <path>` | Path to a config file (default: `~/.elasticrc.yml`) |
| `--use-context <name>` | Override the active context from the config file |
| `--json` | Output results as JSON |

## Commands

### `version`

Print the CLI version.

```bash
elastic version
elastic --json version
```

### `es` - Elasticsearch API

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

- `async-search` - async search APIs
- `cat` - cat APIs
- `cluster` - cluster management
- `connector` - connector management
- `enrich` - enrich policies
- `eql` - EQL search
- `esql` - ES|QL queries
- `indices` - index management
- `inference` - inference endpoints
- `ingest` - ingest pipelines
- `license` - license management
- `logstash` - Logstash pipelines
- `ml` - machine learning
- `project` - project management
- `query-rules` - query rules
- `search-application` - search applications
- `security` - security APIs
- `sql` - SQL queries
- `synonyms` - synonym sets
- `tasks` - task management
- `transform` - transforms

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

### `cloud` - Elastic Cloud (hosted)

Manage Elastic Cloud hosted deployments.
Requires a `cloud` service block in the active context.

#### `cloud deployments`

```bash
elastic cloud deployments list-deployments
elastic cloud deployments get-deployment --id <id>
elastic cloud deployments shutdown-deployment --id <id>
elastic cloud deployments create-deployment <<< '{"name":"my-deployment",...}'
```

Run `elastic cloud --help` for all available namespace groups (accounts,
billing-costs-analysis, deployment-templates, extensions, organizations, etc.).

### `serverless` - Elastic Serverless

Manage Elastic Serverless projects and resources.
Requires a `cloud` service block in the active context.

#### `serverless es projects` - Elasticsearch projects

```bash
elastic serverless es projects list
elastic serverless es projects create <<< '{"name":"demo","region_id":"aws-us-east-1"}'
elastic serverless es projects create --wait <<< '{"name":"demo","region_id":"aws-us-east-1"}'
elastic serverless es projects get --id <id>
elastic serverless es projects delete --id <id>
elastic serverless es projects get-status --id <id>
elastic serverless es projects get-roles --id <id>
elastic serverless es projects reset-credentials --id <id>
```

#### `serverless observability projects` / `serverless security projects`

Same commands as `es projects` but for Observability and Security project types:

```bash
elastic serverless observability projects list
elastic serverless security projects create --wait <<< '{"name":"demo","region_id":"aws-us-east-1"}'
```

#### Other serverless resources

```bash
elastic serverless regions list-regions
elastic serverless traffic-filters list-traffic-filters
```

Run `elastic serverless --help` for all available groups.
