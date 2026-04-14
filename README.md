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
are recognised (checked in this order):

1. `.elasticrc`
2. `.elasticrc.json`
3. `.elasticrc.yaml`
4. `.elasticrc.yml`

You can also point to a config file explicitly with `--config-file <path>` or
the `ELASTIC_CLI_CONFIG_FILE` environment variable. Precedence:
`--config-file` > `ELASTIC_CLI_CONFIG_FILE` > home directory discovery.

JavaScript and TypeScript config files are not supported for security reasons.

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

### `cloud` - Elastic Cloud control plane

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
