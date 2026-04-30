#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup, hideBlockedCommands } from './factory.js'
import type { OpaqueCommandHandle } from './factory.js'
import { loadConfig, type LoadConfigResult } from './config/loader.ts'
import { setResolvedConfig } from './config/store.ts'
import { renderLogo } from './lib/logo.ts'
import { NAMESPACES } from './namespaces.ts'

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
  .option('--output-fields <list>', 'comma-separated list of fields to include in output (dot-notation supported)')
  .option('--output-template <string>', 'Mustache-like template for custom text output (e.g. "{{id}}: {{name}}")')

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit -- never let a config failure
// silently propagate into the command handler.
//
// When no --config-file or --use-context overrides are specified, the hook
// reuses the cached earlyConfig to avoid a redundant load+resolve cycle.
let earlyConfig: LoadConfigResult | undefined

program.hook('preAction', async (thisCommand, actionCommand) => {
  if (actionCommand.name() === 'version') return
  if (actionCommand.name() === 'cli-schema') return
  // docs commands use public elastic.co APIs — no config required
  if (actionCommand.parent?.name() === 'docs') return
  // `config` commands author the config file itself — loading it would be
  // circular (and must tolerate the absence of a file)
  for (let c = actionCommand.parent; c != null; c = c.parent) {
    if (c.name() === 'config') return
  }
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
let firstArg = operands[0]

// Deprecation redirect: `elastic kb ...` → `elastic stack kb ...`
if (firstArg === 'kb') {
  process.stderr.write('Warning: "elastic kb" is deprecated. Use "elastic stack kb" instead.\n')
  const kbIdx = process.argv.indexOf('kb', 2)
  if (kbIdx !== -1) process.argv.splice(kbIdx, 0, 'stack')
  operands.splice(0, 0, 'stack')
  firstArg = 'stack'
}

// Register namespaces: load eagerly when first arg matches, otherwise register a lightweight stub.
// To add a new top-level namespace, add an entry to src/namespaces.ts — no changes needed here.
for (const ns of NAMESPACES) {
  if (firstArg === ns.name) {
    program.addCommand(await ns.load())
  } else {
    program.addCommand(defineGroup({ name: ns.name, description: ns.description }))
  }
}

if (firstArg === 'cli-schema') {
  const { registerCliSchemaCommand } = await import('./cli-schema.ts')
  program.addCommand(await registerCliSchemaCommand(VERSION, program))
} else {
  program.addCommand(defineGroup({ name: 'cli-schema', description: 'Emit the CLI structure as argh-schema JSON' }))
}
// Load config early so --help can hide blocked commands. Skip for commands
// that don't need config (e.g. `version`, or `config` which authors the file)
// to avoid unnecessary file I/O and a confusing "no config found" path.
// The result is cached in earlyConfig so the preAction hook can reuse it.
if (firstArg !== 'version' && firstArg !== 'config' && firstArg !== 'cli-schema') {
  earlyConfig = await loadConfig({})
  if (earlyConfig.ok) {
    setResolvedConfig(earlyConfig.value)
    hideBlockedCommands(program, earlyConfig.value.commands)
  }
}

if (process.argv.slice(2).length === 0) {
  if (!earlyConfig?.ok || earlyConfig.value.banner !== false) {
    process.stdout.write(renderLogo(VERSION))
  }
  program.outputHelp()
  process.exit(0)
}

await program.parseAsync(process.argv)
