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

#### `secret_service` - freedesktop Secret Service (Linux only)

Reads a secret from GNOME Keyring or KWallet via `secret-tool`. Uses the same
`service/account` format as `keychain`.

```yaml
auth:
  api_key: $(secret_service:elastic-cli/api-key)
```

To store a value: `secret-tool store --label='Elastic API Key' service elastic-cli account api-key`

#### `pass` - standard Unix password manager (cross-platform)

Reads the first line from `pass show`. Works on Linux, macOS, and Windows (WSL).

```yaml
auth:
  api_key: $(pass:elastic/api-key)
```

To store a value: `pass insert elastic/api-key`

#### `credential_manager` - Windows Credential Manager (Windows only)

Reads a credential from Windows Credential Manager using the `service/account`
format. Requires the `CredentialManager` PowerShell module.

```yaml
auth:
  api_key: $(credential_manager:elastic-cli/api-key)
```

To store a value: `New-StoredCredential -Target elastic-cli/api-key -UserName _ -Password <key>`

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

### `cloud` - Elastic Cloud

Manage Elastic Cloud: Hosted deployments and Serverless projects.
Requires a `cloud` service block in the active context.

The tree has three kinds of children:

- Cross-cutting namespaces as direct children of `cloud` (APIs that apply to
  both Hosted and Serverless).
- `cloud hosted …` for Hosted-Deployment APIs.
- `cloud serverless …` for Serverless-Project APIs.

#### Cross-cutting (account, auth, orgs, roles)

```bash
elastic cloud accounts get-current-account
elastic cloud authentication get-api-keys
elastic cloud organizations list-organizations
elastic cloud organizations get-organization --organization-id <id>
elastic cloud user-role-assignments add-role-assignments --user-id <id> <<< '{...}'
```

#### `cloud hosted` - Hosted Deployments

```bash
elastic cloud hosted deployments list-deployments
elastic cloud hosted deployments get-deployment --id <id>
elastic cloud hosted deployments shutdown-deployment --id <id>
elastic cloud hosted deployments create-deployment <<< '{"name":"my-deployment",...}'
elastic cloud hosted deployment-templates list-deployment-templates
elastic cloud hosted extensions list-extensions
elastic cloud hosted stack get-version-stacks
```

Run `elastic cloud hosted --help` for all available namespace groups
(billing-costs-analysis, deployment-templates, deployments, deployments-traffic-filter,
extensions, stack, trusted-environments).

#### `cloud serverless` - Serverless Projects

```bash
elastic cloud serverless es projects list
elastic cloud serverless es projects create <<< '{"name":"demo","region_id":"aws-us-east-1"}'
elastic cloud serverless es projects create --wait <<< '{"name":"demo","region_id":"aws-us-east-1"}'
elastic cloud serverless es projects get --id <id>
elastic cloud serverless es projects delete --id <id>
elastic cloud serverless es projects get-status --id <id>
elastic cloud serverless es projects get-roles --id <id>
elastic cloud serverless es projects reset-credentials --id <id>
```

Same commands are available under `observability` and `security`:

```bash
elastic cloud serverless observability projects list
elastic cloud serverless security projects create --wait <<< '{"name":"demo","region_id":"aws-us-east-1"}'
```

Other serverless resources:

```bash
elastic cloud serverless regions list-regions
elastic cloud serverless traffic-filters list-traffic-filters
```

Run `elastic cloud serverless --help` for all available groups.
