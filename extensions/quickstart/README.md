# elastic-quickstart

`elastic quickstart` as a CLI extension: guided, zero-to-one onboarding that
creates a Vector DB serverless project, indexes sample data, and proves semantic
search against keyword search.

**Status: skeleton.** The journey is not ported yet — see
[`.specify/specs/quickstart-extension-design.md`](../../.specify/specs/quickstart-extension-design.md)
for the design and the full list of what the extension model costs.

## Install

```bash
elastic extension install github:elastic/elastic-quickstart
```

For local development, register this directory in place:

```bash
elastic extension create quickstart --path ./extensions/quickstart
```

## Usage

```bash
elastic quickstart              # interactive walk
elastic quickstart --json       # agent runbook
elastic quickstart help         # usage
```

| Flag | Purpose |
|---|---|
| `--json` | emit the agent runbook and exit |
| `--env <prod\|qa>` | target Cloud environment |
| `--cli-bin <path>` | elastic CLI to orchestrate, when it is not on `PATH` |
| `--no-color` | disable ANSI styling |
| `--dry-run` | validate inputs without creating anything |

`--env` and `--no-color` exist as flags because the extension host drops
`ELASTIC_ENV`, `NO_COLOR`, and `FORCE_COLOR` from the child environment.

`elastic quickstart --help` prints the **root CLI help**, not this command's: the
host skips extension dispatch whenever `--help` or `-h` appears in the arguments.
Use `elastic quickstart help`.

## Requirements

- Node.js >= 22.18 — the entrypoint runs TypeScript directly under Node's type
  stripping, because extensions are installed with `--ignore-scripts` and no
  build step runs.
- The `elastic` CLI on `PATH`, or `--cli-bin`. The extension orchestrates real
  CLI commands as subprocesses rather than reimplementing them.

## Development

```bash
npm install
npm test          # node --test
npm run typecheck
```
