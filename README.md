# Elastic CLI

## :warning: the `mvp` branch is a work in progress starting from scratch, not a finished tool

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

Place your config at `~/.config/elastic/config.yml` (recommended) or `.elasticrc.yml` in your home directory or project root.

```yaml
current_context: local

contexts:
  local:
    elasticsearch:
      url: https://localhost:9200
      auth:
        api_key: your-api-key-here
  staging:
    # ...
```

Multiple contexts are supported.
Override `current_context` for a single command with `--context <name>`.
