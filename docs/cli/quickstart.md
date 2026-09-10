---
description: Install and configure the Elastic CLI, connect to Elastic, and run your first command.
applies_to:
  stack: preview
  serverless: preview
type: tutorial
---

# Get started with the Elastic CLI

The Elastic CLI lets you interact with Elastic services from the command line. Use it to explore APIs interactively, automate operations in scripts and CI/CD pipelines, or integrate Elastic operations into agent workflows.

This tutorial helps you install and configure the CLI, connect to an existing {{es}} deployment or {{serverless-full}} project, and perform basic {{es}} operations.

## Before you begin

:::{include} _snippets/installation-requirements.md
:::

To follow the steps in this tutorial, you also need:

- The {{es}} endpoint for an existing cluster, regardless of deployment type, or an {{serverless-full}} project. If you're not sure which endpoint to use, refer to [Find your {{es}} endpoint](docs-content://solutions/elasticsearch-solution-project/search-connection-details.md#find-endpoint-cloud-self-managed).
- An API key that can view cluster health and information.

:::{include} _snippets/api-key-types.md
:::

## Install the CLI

1. Install the CLI globally:

   ```bash
   npm install -g @elastic/cli
   ```

2. Verify that the `elastic` command is available:

   ```bash
   elastic --version
   ```

   The command prints the installed version. If it doesn't, follow the [installation guide](./installation.md) before continuing.

## Add a connection context

The following steps create a context named `quickstart` with the URL and credentials for your {{es}} connection.

If you use Bash or zsh, keep the API key out of your shell history by capturing it in a temporary variable:

Run the following command, paste your API key at the hidden prompt, and press **Enter**:

```bash
read -rs ELASTIC_API_KEY
```

Create the context, replacing `<elasticsearch-url>` with your endpoint:

```bash
elastic config context add quickstart \
  --es-url "<elasticsearch-url>" \
  --es-api-key "$ELASTIC_API_KEY"
unset ELASTIC_API_KEY
```

The CLI stores the API key in your operating system's credential store when one is available. Otherwise, it stores the key in the configuration file and warns you.

API keys are sensitive credentials. The hidden prompt keeps the key out of your shell history, but its value might appear briefly in process listings when passed to `--es-api-key`. For other ways to provide and store secrets, refer to [external credentials](./configuration.md#external-credentials).

Confirm that the context exists:

```bash
elastic config context list
```

The output includes `quickstart`. If this is your first context, the CLI also makes it the current context.

## Verify the connection

Check connectivity and authentication:

```bash
elastic --use-context quickstart status
```

A successful check displays a check mark next to the {{es}} endpoint, followed by its health status and node count. If the command reports an authentication or network error, verify the endpoint and API key in the [configuration guide](./configuration.md).

## Run your first command

Request information about {{es}} and return the response as JSON:

```bash
elastic --use-context quickstart --json es info
```

The response includes identifying information about the connected deployment or project, including its name and version.

List the indices that your API key can access:

```bash
elastic --use-context quickstart es cat indices
```

The output displays index health, status, document counts, and storage sizes in a table. You've now installed the CLI, configured a reusable connection, and run read-only {{es}} API operations.

## Next steps

- Explore available {{es}} commands with `elastic es --help`.
- Use the [Elastic CLI command reference](./index.md) to find commands, options, and input schemas.
- Use the [configuration guide](./configuration.md) to add {{kib}} to the context and learn about external credential resolvers.
- Follow [Manage {{ecloud}} resources with the Elastic CLI](./manage-elastic-cloud.md) to configure the Cloud API and list {{ech}} deployments or {{serverless-full}} projects in your {{ecloud}} account.
