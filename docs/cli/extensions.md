---
description: Install, create, and manage Elastic CLI extensions that add top-level subcommands.
applies_to:
  stack: preview
  serverless: preview
type: how-to
---

# Extend the Elastic CLI

Extensions add new top-level subcommands to the CLI. Once installed, an extension named `demo` is invoked as `elastic demo`.

## Install extensions

```bash
# from a GitHub repository (github:owner/repo or shorthand owner/repo)
elastic extension install github:elastic/elastic-demo
elastic extension install elastic/elastic-demo

# from an npm package
elastic extension install npm:elastic-demo
```

The CLI clones or installs the extension into `~/.elastic/extensions/elastic-<name>/`, discovers the entrypoint from the `package.json` bin field, and registers it. If the repository includes a `package.json`, `npm install --production` is run automatically after cloning.

## Create a local extension

`extension create` scaffolds a new extension and registers it in one step. It is the quickest way to start writing your own extension.

```bash
# create a fresh extension at ~/.elastic/extensions/elastic-my-tool/
elastic extension create my-tool

# register an existing directory as a local extension (files are not overwritten)
elastic extension create demo --path ./path/to/my-extension
```

The scaffolded `index.js` is a runnable starting point that outputs JSON with the current context. Edit it to implement real logic.

## Pass the context to an extension

The CLI passes the selected context to every extension via environment variables before spawning it:

| Variable | Description |
|---|---|
| `ELASTIC_ES_URL` | {{es}} URL from the selected context |
| `ELASTIC_ES_API_KEY` | {{es}} API key |
| `ELASTIC_ES_USERNAME` | {{es}} username, when the context uses basic authentication |
| `ELASTIC_ES_PASSWORD` | {{es}} password, when the context uses basic authentication |
| `ELASTIC_KIBANA_URL` | {{kib}} URL |
| `ELASTIC_KIBANA_API_KEY` | {{kib}} API key |
| `ELASTIC_KIBANA_USERNAME` | {{kib}} username, when the context uses basic authentication |
| `ELASTIC_KIBANA_PASSWORD` | {{kib}} password, when the context uses basic authentication |
| `ELASTIC_CLOUD_URL` | {{ecloud}} API URL |
| `ELASTIC_CLOUD_API_KEY` | {{ecloud}} API key |

The selected context is the current context unless you choose another one. Put the global `--config-file`, `--use-context`, and `--command-profile` options before the extension name, or put the context options directly after it, before the extension's own arguments:

```bash
elastic --use-context staging demo
elastic demo --use-context staging
```

The CLI forwards everything from the extension's first own argument, or from `--`, to the extension untouched.

## Manage extensions

```bash
# list installed extensions
elastic extension list

# upgrade one extension (github and npm sources only)
elastic extension upgrade my-tool

# upgrade all extensions
elastic extension upgrade

# remove an extension
elastic extension remove my-tool
```

## Try the demo extension

The `examples/extensions/basic/` directory in the CLI repository contains a minimal working example. Register it locally with:

```bash
elastic extension create demo --path ./examples/extensions/basic
elastic demo
```
