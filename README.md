# Elastic CLI

Interact with the Elastic Stack and Elastic Cloud from the command line.

## :warning: Tech preview

This CLI tool is a **technical preview** and is still under active development. It does not yet support all features and APIs available in every version of the Elastic stack.

## Installation

Install globally from npm so the `elastic` binary is available on your `PATH`:

```bash
npm install -g @elastic/cli
elastic --help
```

If you don't want a global install, you can run a one-off invocation with
`npx`, which downloads and runs the CLI without persisting it:

```bash
npx -y @elastic/cli --help
```

> If `npm install -g` fails with an `EACCES` permission error on Linux/macOS,
> either re-run with `sudo` or (recommended) point npm's global prefix at a
> user-owned directory:
>
> ```bash
> mkdir -p ~/.npm-global
> npm config set prefix ~/.npm-global
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
> source ~/.bashrc
> ```

## For agents

Prefer `elastic <command> --help --json` for one command and `elastic cli-schema`
for the full tree. Do not ingest `docs/cli/schema.json` directly.

## Quickstart

```bash
elastic config context add local --es-url http://localhost:9200 --es-api-key <api-key>
elastic status
elastic es info
elastic es search --index my-index
elastic cloud hosted deployments list-deployments
```

## Documentation

| Topic | Page |
|---|---|
| Get started | [Quickstart](docs/cli/quickstart.md) |
| Install, update, and uninstall | [Install the Elastic CLI](docs/cli/installation.md) |
| Config file, contexts, credentials | [Configure the Elastic CLI](docs/cli/configuration.md) |
| Config file properties | [Configuration file reference](docs/cli/configuration_reference.md) |
| Elastic Cloud | [Connect to Elastic Cloud](docs/cli/manage-elastic-cloud.md) |
| Tab completion | [Shell completion](docs/cli/shell-completion.md) |
| Extensions | [Extend the Elastic CLI](docs/cli/extensions.md) |
| Commands and global options | [Command reference](docs/cli/index.md) |
