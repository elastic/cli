# Quickstart: Configuration File Loading

**Date**: 2026-03-30
**Feature**: 002-config-file-loading

## What This Feature Does

Adds a configuration file system to the Elastic CLI. When any command runs, the CLI automatically:

1. Finds the config file (`.elasticrc.yml`) using cosmiconfig
2. Validates it against a Zod schema
3. Resolves the active context (from `current-context` field or `--context` flag)
4. Passes a typed `ResolvedConfig` object to the command handler

## Quick Setup

### 1. Create a config file

Create `~/.elasticrc.yml`:

```yaml
current-context: local

contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        type: basic
        username: elastic
        password: changeme
```

### 2. Run a command

```bash
elastic ping
```

The command handler receives a typed config object with only the `local` context's service blocks.

### 3. Override the context

```bash
elastic ping --context staging
```

### 4. Override the config file

```bash
elastic ping --config /path/to/other-config.yml
```

## Key Files

| File | Purpose |
|------|---------|
| `src/config/schema.ts` | Zod schemas for config file structure |
| `src/config/loader.ts` | cosmiconfig setup, validation, and context resolution |
| `src/config/types.ts` | TypeScript types exported from Zod schemas |
| `test/config/schema.test.ts` | Schema validation tests |
| `test/config/loader.test.ts` | Loader pipeline tests |

## Architecture

```text
CLI invocation
  → Commander parses global flags (--config, --context)
  → preAction hook triggers config loader
    → cosmiconfig discovers/loads YAML file
    → Zod validates raw config
    → Resolver extracts active context
    → Returns ResolvedConfig
  → Command handler receives ResolvedConfig via ParsedResult
```

## Dependencies Used

- **cosmiconfig** (existing): Config file discovery with ID `elastic`
- **zod** (existing): Schema validation and type inference
- **yaml** (existing): Available but not directly needed — cosmiconfig handles YAML natively
- **No new dependencies added**
