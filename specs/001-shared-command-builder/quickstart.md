# Quickstart: Shared Command Builder

**Branch**: `001-shared-command-builder` | **Date**: 2026-03-30

## Define a simple command

```typescript
// src/commands/greet.ts
import { defineCommand } from '../factory.ts'

export const greetCmd = defineCommand({
  name: 'greet',
  description: 'Greet a user by name',
  options: [
    { long: 'name', short: 'n', description: 'Name of the person to greet', required: true },
    { long: 'loud', short: 'l', description: 'Use uppercase', type: 'boolean' },
  ],
  handler: (parsed) => {
    const name = parsed.options.name as string
    const loud = parsed.options.loud as boolean
    const greeting = `Hello, ${name}!`
    console.log(loud ? greeting.toUpperCase() : greeting)
  }
})
```

## Register with the CLI

```typescript
// src/cli.ts
import { program } from 'commander'
import { greetCmd } from './commands/greet.ts'

program.addCommand(greetCmd)
program.parse(process.argv)
```

## Define a command group

```typescript
// src/commands/cluster/index.ts
import { defineCommand, defineGroup } from '../factory.ts'

const healthCmd = defineCommand({
  name: 'health',
  description: 'Check cluster health',
  options: [
    { long: 'timeout', short: 't', description: 'Timeout in seconds', type: 'number', defaultValue: 30 }
  ],
  handler: (parsed) => {
    console.log(`Checking health with timeout: ${parsed.options.timeout}s`)
  }
})

const statsCmd = defineCommand({
  name: 'stats',
  description: 'Show cluster statistics',
  handler: () => {
    console.log('Cluster stats...')
  }
})

export const clusterGroup = defineGroup(
  { name: 'cluster', description: 'Manage Elasticsearch clusters' },
  healthCmd,
  statsCmd
)
```

## Run it

```bash
# Simple command
elastic greet --name Alice
elastic greet --name Alice --loud

# Command group
elastic cluster health
elastic cluster health --timeout 60
elastic cluster stats

# Help
elastic greet --help
elastic cluster --help
elastic cluster health --help
```
