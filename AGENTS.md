# Elastic CLI

This is a CLI that exposes a large surface area of subcommands to interact with Elasticsearch, Elastic Cloud and Elasticsearch Serverless control plane APIs.
It targets LLM-powered agents as first-class users by providing several guardrails and machine-friendly inputs and outputs.

## Tech Stack

- **Runtime**: Node.js with native TypeScript (using `--experimental-strip-types`)
- **CLI Framework**: Commander.js
- **Validation**: Zod v4
- **Config Management**: cosmiconfig
- **Config Serialization**: YAML
- **Testing**: Node.js built-in test runner (node:test)
- **Linting**: ESLint + TypeScript ESLint
- **TypeScript**: Strict mode with ESNext + nodenext module resolution

Adding other new third-party dependencies is highly discouraged to reduce supply-chain attack surface.

## Architecture

Commands are defined through shared, reusable config structures (see `factory.ts`). Custom logic only permitted for behaviors that cannot be expressed in config.

## Code Patterns & Conventions

### SPDX Headers
All code files **MUST** start with:
```
/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */
```

### Code Standards
- **Docstrings**: All exported symbols in reusable utilities MUST have complete doc comments
- **Comments**: Explain WHY, not WHAT. Don't restate code in prose
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces
- **YAML config**: ALL key names use `snake_case` (e.g. `api_key`, `current_context`). Never camelCase or kebab-case
- **Files**: Proper trailing newline, no trailing whitespace

### TypeScript Configuration
- Strict mode: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: force`
- Source maps and declaration maps enabled

## TDD Discipline

**ALWAYS** follow this cycle autonomously:
1. Write a failing test capturing intended behavior (RED)
2. Confirm test fails for the right reason
3. Write minimum implementation to make test pass (GREEN)
4. Refactor under green, keeping tests passing (REFACTOR)

Do not stop between writing test and implementation. Proceed through the full cycle.

**Task completion**: All tests pass (`npm test` exits 0), lint checks pass, no style violations.

## Spec-Kit Workflow

The project uses [spec-kit](https://github.com/github/spec-kit) for AI-assisted feature development.

| Path | Purpose |
|------|---------|
| `.specify/specs/` | Feature specifications |
| `.specify/plans/` | Implementation plans |
| `.specify/tasks/` | Task definitions |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) |
| `.specify/templates/` | Markdown templates |
| `.specify/scripts/` | Helper shell scripts |
| `.specify/hooks.yml` | CI/automation hook definitions |
