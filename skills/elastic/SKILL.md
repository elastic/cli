---
name: elastic
description: Run the Elastic CLI from an agent host. Configure a context, run read commands, and handle output and errors without prompting.
---

# Elastic CLI for agents

## Interactivity

Never prompt. Pass `--yes` for destructive actions. Run `--dry-run` before mutations to validate inputs without executing.

## Output

Prefer `--json` on every command. Discover inputs with `--help --json` or `elastic cli-schema`. Do not dump `docs/cli/schema.json` into context; query the command you need.

## Contexts and credentials

Target a context with `--use-context <name>`. Never pass API keys, passwords, or tokens as flags. They belong in the config file or environment variables.

## Environment

- `ELASTIC_CLI_CONFIG_FILE`: config file path override
- `ELASTIC_CLI_TELEMETRY`: telemetry opt-out
- `ELASTIC_NO_BANNER`: hide the startup banner
- `NO_COLOR`: disable ANSI colors

## Diagnose before retry

Run `elastic status --json` before retrying a failed API call. On error, read `error.code`: `confirmation_required` means add `--yes`.
