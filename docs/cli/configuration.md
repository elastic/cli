# Configuration

The CLI looks for a config file in your home directory. The following file names are checked in order:

1. `.elasticrc`
2. `.elasticrc.json`
3. `.elasticrc.yaml`
4. `.elasticrc.yml`

Place your config at `~/.elasticrc.yml` (recommended). To use a file in a different location, pass `--config-file <path>` or set `ELASTIC_CLI_CONFIG_FILE`. The flag takes precedence over the environment variable.

```yaml
current_context: local

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

Multiple contexts are supported. Override `current_context` for a single command with `--use-context <name>`.

Each context can have any combination of service blocks (`elasticsearch`, `kibana`, `cloud`). Authentication supports `api_key` or `username` + `password`.

## Authoring the config from the CLI

Instead of hand-editing YAML, the `elastic config` command group creates and maintains contexts and stores secrets in the OS keychain when available (macOS Keychain, Linux libsecret, `pass`, Windows Credential Manager). The YAML then holds a resolver expression like `$(keychain:...)` rather than the raw secret.

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

If no OS keychain is available or you pass `--inline-secrets`, the secret is written inline and the file is `chmod 0600`. A warning is emitted when a loaded config has inline secrets at looser-than-0600 permissions.

## Credential-safe project creation

For agent and LLM workflows, `serverless projects create` and `reset-credentials` accept `--save-as <context>` to avoid leaking admin credentials through stdout:

```bash
elastic cloud serverless es projects create --wait --save-as scratch \
  --name scratch-es --region-id aws-us-east-1

# stdout has endpoints + a `savedAs: scratch` marker, password is redacted.
# The keychain now holds scratch:elasticsearch.auth.password etc.
elastic --use-context scratch stack es indices list

# Rotate credentials; URL stays, only the password moves.
elastic cloud serverless es projects reset-credentials --id <id> \
  --save-as scratch --force
```

`--credentials-file <path>` writes a standalone YAML config fragment (0600) at `<path>` instead of mutating the main config. Either flag makes stdout safe to capture into an LLM transcript.

## External credentials

Any string value in the config file can use `$(resolver:params)` expressions to fetch secrets from external sources at runtime.

:::{warning}
Review config files before using them if you didn't write them yourself. The `$(cmd:...)` and `$(file:...)` resolvers execute programs and read files on your behalf. This applies especially to CI/CD environments where a repo-checked-in config (e.g. via `ELASTIC_CLI_CONFIG_FILE`) can run arbitrary commands on the runner.
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
