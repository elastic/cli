# Contract: Command Factory API

**Branch**: `001-shared-command-builder` | **Date**: 2026-03-30

This document defines the public API contract for the shared command factory exported from `src/factory.ts`. Command authors depend on this interface; changes must be backward-compatible.

## Exports

### `defineCommand(config: CommandConfig): OpaqueCommandHandle`

Creates a leaf command from a declarative configuration object. Returns an opaque handle that can be registered with the CLI program or added to a command group.

Commands are identified by their name and position in the subcommand tree. All inputs beyond the command name are passed as named options or flags — positional arguments are not supported.

**Behavior**:
1. Registers the command name and description
2. Registers all declared options
3. On invocation: parses options → coerces types → validates → invokes handler with `ParsedResult`
4. On parse/coercion failure: prints a structured error message and exits with non-zero code
5. On `--help`: prints auto-generated help text from the command definition

**Example usage**:
```typescript
import { defineCommand } from './factory.ts'

const cmd = defineCommand({
  name: 'health',
  description: 'Check cluster health status',
  options: [
    { long: 'verbose', short: 'v', description: 'Show detailed output', type: 'boolean' },
    { long: 'timeout', short: 't', description: 'Request timeout in seconds', type: 'number', defaultValue: 30 }
  ],
  handler: (parsed) => {
    // parsed.options.verbose is boolean
    // parsed.options.timeout is number (default: 30)
  }
})
```

### `defineGroup(config: GroupConfig, ...commands: OpaqueCommandHandle[]): OpaqueCommandHandle`

Creates a command group that contains child commands. Returns an opaque handle for registration or further nesting.

**Behavior**:
1. Registers the group name and description
2. Attaches all provided child commands
3. When invoked without a sub-command: displays help listing available sub-commands
4. When invoked with `--help`: displays group-level help

**Example usage**:
```typescript
import { defineCommand, defineGroup } from './factory.ts'

const healthCmd = defineCommand({ name: 'health', /* ... */ })
const statsCmd = defineCommand({ name: 'stats', /* ... */ })

const clusterGroup = defineGroup(
  { name: 'cluster', description: 'Manage Elasticsearch clusters' },
  healthCmd,
  statsCmd
)
```

## Error Contract

All errors produced by the factory (parse failures, type coercion errors, missing required options) follow this structure when printed to stderr:

```
Error: <human-readable message>

Usage: elastic <command-path> [options]

Run "elastic <command-path> --help" for more information.
```

The factory does NOT catch errors thrown by the handler callback — those propagate to the caller.

## Stability Guarantees

- The `CommandConfig`, `GroupConfig`, `OptionDefinition`, and `ParsedResult` shapes are the stable public API
- `OpaqueCommandHandle` is intentionally opaque — callers must not depend on its internal structure
- New optional fields may be added to config types in future versions without breaking existing definitions
- The factory may gain new cross-cutting behaviors (output formatting, auth, etc.) without requiring changes to existing command definitions
