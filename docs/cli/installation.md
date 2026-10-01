---
description: Install, update, or uninstall the Elastic CLI with npm, or run it without installing by using npx.
applies_to:
  stack: preview
  serverless: preview
type: how-to
---

# Install the Elastic CLI

Install the Elastic CLI globally to make the `elastic` command available from your terminal. For occasional use, you can run the CLI through `npx` without installing it.

## Before you begin

:::{include} _snippets/installation-requirements.md
:::

## Install globally

1. Install the `elastic` binary to your `PATH`:

   ```bash
   npm install -g @elastic/cli
   ```

2. Verify the installation:

   ```bash
   elastic --version
   ```

   The command prints the installed Elastic CLI version.

If npm reports an `EACCES` error on Linux or macOS, follow the npm instructions for [resolving permissions errors when installing packages globally](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally). Don't rerun the installation with `sudo`.

## Run without installing

To run a one-off command without a permanent install, use `npx`:

```bash
npx -y @elastic/cli --help
```

The command downloads the package to the npm cache, prints the CLI help, and exits.

## Update the CLI

Install the latest version and verify the update:

```bash
npm install -g @elastic/cli@latest
elastic --version
```

## Uninstall the CLI

Remove the global installation:

```bash
npm uninstall -g @elastic/cli
```

This command removes the `elastic` executable. It doesn't remove your configuration file or credentials stored outside the CLI.

## Next steps

- Follow [Get started with the Elastic CLI](./quickstart.md) to connect to Elastic and run your first command.
- [Configure the Elastic CLI](./configuration.md) to connect to your {{es}}, {{kib}}, or {{ecloud}} endpoints.
