# Elastic CLI

This is a CLI that exposes a large surface area of subcommands to interact with Elasticsearch, Elastic Cloud and Elasticsearch Serverless control plane APIs.
It targets LLM-powered agents as first-class users by providing several guardrails and machine-friendly inputs and outputs.

In order to enforce strong support for agents, most command definitions will be handled by core, reusable utilities that enforce how commands are defined, configured and run.

## Dependencies

- [Commander.js](https://www.npmjs.com/package/commander) for CLI argument parsing
- [@elastic/transport](https://github.com/elastic/elastic-transport-js/) for Elasticsearch requests
- [Zod v4](https://zod.dev/) for schema validation
- [cosmiconfig](https://www.npmjs.com/package/cosmiconfig) for configuration file management

Adding other new third-party dependencies is highly discouraged, in order to reduce the surface area of supply-chain attacks.

## TDD discipline

When writing code, **ALWAYS** follow the red/green cycle autonomously:

1. Write the failing test first and confirm it fails for the right reason.
2. Write the minimum implementation to make it pass.
3. Refactor while keeping tests green.

Do not stop and ask for human approval between writing a test and writing its implementation.
Proceed through the full red/green/refactor cycle and surface results at the task completion boundary.

A task is not complete until it passes `npm test`.

## Code patterns

- All code files **MUST** have an Apache 2.0 SPDX header comment:
  ```
  /**
   * Copyright Elasticsearch B.V. and contributors
   * SPDX-License-Identifier: Apache-2.0
   */
  ```
- All key names in config YAML files **MUST** use `snake_case` (e.g. `api_key`, `current_context`). Never use camelCase or kebab-case for YAML config keys.

## Spec-Kit

This repository uses the [spec-kit](https://github.com/github/spec-kit) workflow for AI-assisted feature development.
Spec-kit is a convention for structuring feature specs, plans, and tasks in a `.specify/` directory so that AI agents can read and act on them.
This project uses an opinionated local tooling layer to generate the artifacts that live there — the source of truth for the workflow itself is the spec-kit repo linked above.

### `.specify/` directory

| Path | Purpose |
|------|---------|
| `.specify/templates/` | Markdown templates for specs, plans, tasks, and checklists |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) read by agents |
| `.specify/scripts/` | Helper shell scripts for common workflow steps |
| `.specify/hooks.yml` | CI/automation hook definitions |
