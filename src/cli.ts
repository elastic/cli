#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { defineCommand, defineGroup, hideBlockedCommands } from './factory.js'
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

// Lazily load command trees only when the relevant top-level subcommand is actually
// invoked. For all other invocations (including `elastic --help`), a lightweight stub
// is registered so the group appears in help text without paying the cost of loading
// and compiling all API schemas.
const firstArg = process.argv[2]

if (firstArg === 'es') {
  const { registerEsCommands } = await import('./es/register.ts')
  program.addCommand(registerEsCommands())
} else {
  program.addCommand(defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }))
}

if (firstArg === 'cloud') {
  const { registerCloudCommands } = await import('./cloud/register.ts')
  program.addCommand(registerCloudCommands())
} else {
  program.addCommand(defineGroup({ name: 'cloud', description: 'Manage Elastic Cloud deployments and serverless projects' }))
}

// Load config before Commander parses so --help can hide blocked commands.
// Uses cosmiconfig auto-discovery (the preAction hook re-loads with any
// --config/--context overrides when an actual command runs).
const earlyResult = await loadConfig({})
if (earlyResult.ok) {
  setResolvedConfig(earlyResult.value)
  hideBlockedCommands(program, earlyResult.value.commands)
}

if (process.argv.slice(2).length === 0) {
  program.outputHelp()
  process.exit(0)
}

await program.parseAsync(process.argv)
