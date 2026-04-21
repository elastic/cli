#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup, hideBlockedCommands } from './factory.js'
import { loadConfig, type LoadConfigResult } from './config/loader.ts'
import { setResolvedConfig } from './config/store.ts'

// x-release-please-start-version
const VERSION = '0.1.0-alpha.1';
// x-release-please-end

const program = new Command()

program
  .name('elastic')
  .description('Interface with the Elastic Stack and Elastic Cloud from the command line.')
  .option('--config-file <path>', 'path to a config file (default: ~/.elasticrc.yml)')
  .option('--use-context <name>', 'override the active context from the config file')
  .option('--json', 'output as JSON')

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit -- never let a config failure
// silently propagate into the command handler.
//
// When no --config-file or --use-context overrides are specified, the hook
// reuses the cached earlyConfig to avoid a redundant load+resolve cycle.
let earlyConfig: LoadConfigResult | undefined

program.hook('preAction', async (thisCommand, actionCommand) => {
  if (actionCommand.name() === 'version') return
  // docs commands use public elastic.co APIs — no config required
  if (actionCommand.parent?.name() === 'docs') return
  const { configFile: configPath, useContext: contextName } = thisCommand.opts()

  if (configPath == null && contextName == null && earlyConfig?.ok === true) {
    setResolvedConfig(earlyConfig.value)
    return
  }

  const result = await loadConfig({
    ...(configPath != null && { configPath }),
    ...(contextName != null && { contextName })
  })
  if (result.ok) {
    setResolvedConfig(result.value)
  } else {
    process.stderr.write(`Error: ${result.error.message}\n`)
    process.exit(1)
  }
})

// All sub-commands are defined via the factory and registered here with addCommand().
// Never use program.command() or new Command() directly for sub-commands -- always go
// through defineCommand() or defineGroup() so cross-cutting concerns are applied uniformly.

const versionCmd = defineCommand({
  name: 'version',
  description: 'Print the elastic CLI version',
  handler: () => ({ version: VERSION })
})
program.addCommand(versionCmd)

// Lazily load command trees only when the relevant top-level subcommand is actually
// invoked. For all other invocations (including `elastic --help`), a lightweight stub
// is registered so the group appears in help text without paying the cost of loading
// and compiling all API schemas.
const { operands } = program.parseOptions(process.argv.slice(2))
const firstArg = operands[0]

if (firstArg === 'stack') {
  const { registerEsCommands } = await import('./es/register.ts')
  program.addCommand(defineGroup(
    { name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' },
    registerEsCommands()
  ))
} else {
  program.addCommand(defineGroup({ name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' }))
}

if (firstArg === 'cloud') {
  const { registerCloudCommands } = await import('./cloud/register.ts')
  program.addCommand(registerCloudCommands())
} else {
  program.addCommand(defineGroup({ name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' }))
}

if (firstArg === 'docs') {
  const { registerDocsCommands } = await import('./docs/register.ts')
  program.addCommand(registerDocsCommands())
} else {
  program.addCommand(defineGroup({ name: 'docs', description: 'Search, read, and ask questions about Elastic documentation' }))
}

// Load config early so --help can hide blocked commands. Skip for commands
// that don't need config (e.g. `version`) to avoid unnecessary file I/O.
// The result is cached in earlyConfig so the preAction hook can reuse it.
if (firstArg !== 'version') {
  earlyConfig = await loadConfig({})
  if (earlyConfig.ok) {
    setResolvedConfig(earlyConfig.value)
    hideBlockedCommands(program, earlyConfig.value.commands)
  }
}

if (process.argv.slice(2).length === 0) {
  program.outputHelp()
  process.exit(0)
}

await program.parseAsync(process.argv)
