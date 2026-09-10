---
description: Configure the Elastic CLI to connect to Elastic Cloud and list Hosted deployments and Serverless projects.
applies_to:
  deployment:
    ech: preview
    ece: unavailable
  serverless: preview
type: tutorial
---

# Manage {{ecloud}} resources with the Elastic CLI

The Elastic CLI exposes {{ecloud}} APIs for managing organizations, {{ech}} deployments, and {{serverless-full}} projects. These APIs manage Cloud resources and their lifecycle; they are separate from the {{es}} and {{kib}} APIs used to work with data and solution features.

This tutorial assumes that you have already installed the CLI. It helps you configure an {{ecloud}} connection, verify authentication, and list the Hosted deployments and Serverless projects that your API key can access.

## Before you begin

You need:

- An [installed Elastic CLI](./installation.md).
- Access to an {{ecloud}} organization.
- An [{{ecloud}} API key](docs-content://deploy-manage/api-keys/elastic-cloud-api-keys.md) with Cloud API access and roles for the resources you want to manage.

## Add an {{ecloud}} context

The following steps create a context named `elastic-cloud` that connects to the public {{ecloud}} API.

If you use Bash or zsh, keep the API key out of your shell history by capturing it in a temporary variable:

```bash
read -rs ELASTIC_CLOUD_API_KEY
```

Paste your API key at the hidden prompt, press **Enter**, and create the context:

```bash
elastic config context add elastic-cloud \
  --cloud-url "https://api.elastic-cloud.com" \
  --cloud-api-key "$ELASTIC_CLOUD_API_KEY"
unset ELASTIC_CLOUD_API_KEY
```

The CLI stores the API key in your operating system's credential store when one is available. Otherwise, it stores the key in the configuration file and warns you. For other ways to provide and store secrets, refer to [external credentials](./configuration.md#external-credentials).

## Verify the connection

Check connectivity and authentication for the new context:

```bash
elastic --use-context elastic-cloud status
```

A successful check displays a check mark next to `https://api.elastic-cloud.com`.

To make `elastic-cloud` the active context, run:

```bash
elastic config current-context set elastic-cloud
```

The remaining examples use `--use-context` explicitly, so changing the active context is optional.

## List Hosted deployments

List the {{ech}} deployments that your API key can access:

```bash
elastic --use-context elastic-cloud \
  cloud hosted deployments list-deployments
```

The response contains deployment identifiers, names, aliases, and resource details.

## List Serverless projects

List the {{serverless-full}} search projects that your API key can access:

```bash
elastic --use-context elastic-cloud \
  cloud serverless projects search list
```

Replace `search` with `observability` or `security` to list another project type:

```bash
elastic --use-context elastic-cloud \
  cloud serverless projects observability list
```

## Next steps

- Run `elastic cloud --help`, `elastic cloud hosted --help`, or `elastic cloud serverless --help` to explore Cloud management commands.
- Use the [Elastic CLI command reference](./index.md) to inspect command options and input schemas.
- Learn how to [create a Serverless project and save its credentials](./configuration.md#credential-safe-project-creation).
- Use the [configuration guide](./configuration.md) to add {{es}} or {{kib}} to this context, or create a separate context for each environment.
- Before creating an {{ech}} deployment, inspect its required input with `elastic cloud hosted deployments create-deployment --help`.
