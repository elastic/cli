---
description: Use the Elastic CLI to interact with the Elastic Stack and Elastic Cloud from the command line.
applies_to:
  stack: preview
  serverless: preview
type: overview
---

# Elastic CLI

The Elastic CLI (`elastic`) provides a single command-line interface for {{es}}, {{kib}}, and {{ecloud}}. Use it to interact directly with {{es}} and {{kib}} across deployment types, or to manage {{ech}} deployments and {{serverless-full}} projects through the {{ecloud}} API.

The CLI groups its API commands into two main namespaces:

- **`elastic stack`:** Connect directly to {{es}} and {{kib}} APIs across fully self-managed deployments, {{eck}}, {{ece}}, {{ech}}, and {{serverless-full}} projects. You can use `elastic es` and `elastic kb` as shorter forms.
- **`elastic cloud`:** Use {{ecloud}} APIs to manage {{ech}} deployments and {{serverless-full}} projects.

Use named contexts to save and switch between service connections. Commands support structured output for scripts, agents, and other tools.

:::{note}
The Elastic CLI is a technical preview and is under active development. Not all Elastic APIs are available as CLI commands. Refer to the [Elastic CLI command reference](./cli/index.md) for the currently available commands.
:::

## Get started

The following resources help you start using the Elastic CLI:

- Follow the [Elastic CLI quickstart](./cli/quickstart.md) to install the CLI, configure an {{es}} connection, and run your first commands.
- Refer to [Install the Elastic CLI](./cli/installation.md) for detailed instructions to install, update, or uninstall the CLI.
- Refer to [Configure the Elastic CLI](./cli/configuration.md) to manage connection contexts and credentials.

## Learn more

- Refer to the [Elastic CLI command reference](./cli/index.md) for commands, options, and input schemas.
- Follow [Manage {{ecloud}} resources with the Elastic CLI](./cli/manage-elastic-cloud.md) to configure an {{ecloud}} connection and manage {{ech}} deployments and {{serverless-full}} projects.
