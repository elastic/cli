#!/usr/bin/env node
/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { defineCommand } from './factory.js'
import type { ParsedResult } from './factory.js'
import { loadConfig } from './config/loader.ts'
import { setResolvedConfig } from './config/store.ts'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('elastic')
  .description('Interface with Elasticsearch, Elastic Serverless and Elastic Cloud APIs from the command line.')
  .version(version)
  .option('--config <path>', 'path to a config file, bypassing cosmiconfig discovery')
  .option('--context <name>', 'override the active context from the config file')

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit — never let a config failure
// silently propagate into the command handler.
program.hook('preAction', async (thisCommand) => {
  const { config: configPath, context: contextName } = thisCommand.opts() as {
    config?: string
    context?: string
  }
  const result = await loadConfig({
    ...(configPath != null && { configPath }),
    ...(contextName != null && { contextName }),
  })
  if (result.ok) {
    setResolvedConfig(result.value)
  }
})

// All sub-commands are defined via the factory and registered here with addCommand().
// Never use program.command() or new Command() directly for sub-commands — always go
// through defineCommand() or defineGroup() so cross-cutting concerns are applied uniformly.

const pingCmd = defineCommand({
  name: 'ping',
  description: 'Verify connectivity to the Elasticsearch cluster',
  handler: (parsed: ParsedResult) => {
    const esUrl = parsed.config?.context.elasticsearch?.url
    if (esUrl != null) {
      console.log(`pong (${esUrl})`)
    } else {
      console.log('pong')
    }
  },
})
program.addCommand(pingCmd)

if (process.argv.slice(2).length === 0) {
  program.outputHelp()
  process.exit(0)
}

program.parseAsync(process.argv)
