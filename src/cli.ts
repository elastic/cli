#!/usr/bin/env node
/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { defineCommand, defineGroup } from './factory.ts'
import type { ParsedResult } from './factory.ts'
import { loadConfig } from './config/loader.ts'
import { setResolvedConfig } from './config/store.ts'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('elastic')
  .description('Interface with Elasticsearch, Elastic Serverless and Elastic Cloud APIs from the command line.')
  .option('--config-file <path>', 'path to a config file, bypassing cosmiconfig discovery')
  .option('--use-context <name>', 'override the active context from the config file')
  .option('--json', 'output as JSON')

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit -- never let a config failure
// silently propagate into the command handler.
program.hook('preAction', async (thisCommand) => {
  const { configFile: configPath, useContext: contextName } = thisCommand.opts()
  const result = await loadConfig({
    ...(configPath != null && { configPath }),
    ...(contextName != null && { contextName })
  })
  if (result.ok) {
    setResolvedConfig(result.value)
  }
})

// All sub-commands are defined via the factory and registered here with addCommand().
// Never use program.command() or new Command() directly for sub-commands -- always go
// through defineCommand() or defineGroup() so cross-cutting concerns are applied uniformly.

const versionCmd = defineCommand({
  name: 'version',
  description: 'Print the elastic CLI version',
  handler: () => ({ version })
})
program.addCommand(versionCmd)

const pingCmd = defineCommand({
  name: 'ping',
  description: 'Verify connectivity to the Elasticsearch cluster',
  handler: (parsed: ParsedResult) => {
    const esUrl = parsed.config?.context.elasticsearch?.url
    return esUrl != null ? { status: 'ok', url: esUrl } : { status: 'ok' }
  }
})
program.addCommand(pingCmd)
// Lazily load the full ES command tree only when an `es` subcommand is actually
// invoked. For all other invocations (including `elastic --help`), register a
// lightweight stub so that `es` appears in the top-level help text without paying
// the cost of loading and compiling all Elasticsearch API schemas.
const esArgs = process.argv.slice(2)
if (esArgs[0] === 'es') {
  const { registerEsCommands } = await import('./es/register.ts')
  program.addCommand(registerEsCommands())
} else {
  program.addCommand(defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }))
}

if (process.argv.slice(2).length === 0) {
  program.outputHelp()
  process.exit(0)
}

program.parseAsync(process.argv)
