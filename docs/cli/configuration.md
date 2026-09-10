---
description: Configure the Elastic CLI by creating a config file with connection contexts for Elasticsearch, Kibana, and Elastic Cloud.
applies_to:
  stack: preview
  serverless: preview
type: how-to
---

# Configure the Elastic CLI

This guide covers the configuration file format, managing connection contexts with `elastic config`, and using external credential resolvers to keep secrets out of your configuration file.

## Before you begin

[Install the Elastic CLI](./installation.md) before continuing.

## Configure contexts

The CLI organizes connection settings into named contexts. Each context can contain connection and authentication details for one {{es}} endpoint, one {{kib}} endpoint, and one {{ecloud}} endpoint.

One context can be set as the current context. The CLI uses it when a command doesn't specify another context with `--use-context <name>`.

Contexts are stored in the CLI configuration file. You can edit this file directly or use `elastic config` to update it.

### Edit the configuration file

The CLI looks for a config file in your home directory. The following file names are checked in order:

1. `.elasticrc`
2. `.elasticrc.json`
3. `.elasticrc.yaml`
4. `.elasticrc.yml`

Place your config at `~/.elasticrc.yml` (recommended). To use a file in a different location, pass `--config-file <path>` or set the `ELASTIC_CLI_CONFIG_FILE` environment variable. The flag takes precedence over the environment variable.

```yaml
current_context: local <1>

contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: your-api-key-here
    kibana:
      url: http://localhost:5601
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
1. Sets `local` as the context used when `--use-context` is not specified.

A context can contain any combination of the `elasticsearch`, `kibana`, and `cloud` service blocks. Each block specifies an endpoint URL and optional authentication details. {{es}} and {{kib}} support API key or username and password authentication; {{ecloud}} requires an API key.

:::{include} _snippets/api-key-types.md
:::

Refer to the [CLI configuration reference](./configuration_reference.md) for all available config options.

### Use `elastic config`

The `elastic config` command group creates and maintains contexts and stores secrets in the operating system's credential store when available (macOS Keychain, Linux libsecret, `pass`, Windows Credential Manager). In that case, the configuration file contains a resolver expression such as `$(keychain:...)` instead of the secret value.

```bash
# Add a new context (API key goes to the keychain)
elastic config context add local \
  --es-url http://localhost:9200 \
  --es-api-key your-api-key

# List contexts
elastic config context list

# Switch the active context
elastic config current-context set staging

# Patch an existing context
elastic config context edit local --es-url http://localhost:9201

# Open the context as YAML in $EDITOR
elastic config context edit local

# Remove a context (keychain entries are cleaned up)
elastic config context remove old-lab
```

If no operating system credential store is available or you pass `--inline-secrets`, the CLI writes secrets directly to the configuration file and restricts access to the current user (file mode `0600` on Linux and macOS). It warns you if a configuration file containing inline secrets has broader permissions.

## Verify your configuration

Run `elastic status` to check connectivity and authentication for the services configured in the current context:

```bash
elastic status
```

To check another context without making it the current context, pass `--use-context`:

```bash
elastic --use-context staging status
```

The command reports a result for each configured service (`elasticsearch`, `kibana`, or `cloud`) in the selected context.

## Credential-safe project creation
```{applies_to}
serverless: preview
```

For agent and LLM workflows, `serverless projects create` and `reset-credentials` accept `--save-as <context>` to avoid leaking admin credentials through stdout:

```bash
elastic cloud serverless projects search create --wait --save-as scratch \
  --name scratch-es --region-id aws-us-east-1

# stdout has endpoints + a `savedAs: scratch` marker, password is redacted.
# The keychain now holds scratch:elasticsearch.auth.password etc.
elastic --use-context scratch es info

# Rotate credentials; URL stays, only the password moves.
elastic cloud serverless projects search reset-credentials --id <id> \
  --save-as scratch --force
```

`--credentials-file <path>` writes a standalone YAML config fragment (0600) at `<path>` instead of mutating the main config. Both flags make stdout safe to capture into an LLM transcript.

## External credentials

Any string value in the config file can use `$(resolver:params)` expressions to fetch secrets from external sources at runtime.

:::{warning}
Review config files before using them if you didn't write them yourself. The `$(cmd:...)` and `$(file:...)` resolvers run programs and read files on your behalf. This applies especially to CI/CD environments where a repo-checked-in config (for example, via `ELASTIC_CLI_CONFIG_FILE`) can run arbitrary commands on the runner.
:::

`file`
:   Reads the contents of a file (trimmed). Useful for Docker/Kubernetes secrets mounted at `/run/secrets/`.

    ```yaml
    auth:
      api_key: $(file:/run/secrets/elastic_api_key)
    ```

`env`
:   Reads an environment variable.

    ```yaml
    auth:
      api_key: $(env:ELASTIC_API_KEY)
    ```

`cmd`
:   Executes a shell command and uses its stdout (trimmed) as the value.

    ```yaml
    auth:
      api_key: $(cmd:pass show elastic/api-key)
    ```

`keychain` *(macOS only)*
:   Reads a password from the macOS Keychain using `service/account` format.

    ```yaml
    auth:
      api_key: $(keychain:elastic-cli/api-key)
    ```

    To store a value: `security add-generic-password -s elastic-cli -a api-key -w`

`secret_service` *(Linux only)*
:   Reads a secret from GNOME Keyring or KWallet via `secret-tool`.

    ```yaml
    auth:
      api_key: $(secret_service:elastic-cli/api-key)
    ```

    To store a value: `secret-tool store --label='Elastic API Key' service elastic-cli account api-key`

`pass` *(cross-platform)*
:   Reads the first line from `pass show`. Works on Linux, macOS, and Windows (WSL).

    ```yaml
    auth:
      api_key: $(pass:elastic/api-key)
    ```

    To store a value: `pass insert elastic/api-key`

`credential_manager` *(Windows only)*
:   Reads a credential from Windows Credential Manager. Requires the `CredentialManager` PowerShell module.

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

## Next steps

- Run `elastic --help` to explore available commands.
- Refer to the [CLI command reference](./index.md) for the full list of available commands.
- Follow [Manage {{ecloud}} resources with the Elastic CLI](./manage-elastic-cloud.md) to configure an {{ecloud}} connection and manage {{ech}} deployments and {{serverless-full}} projects.
