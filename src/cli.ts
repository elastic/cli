#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup, hideBlockedCommands } from './factory.js'
import type { OpaqueCommandHandle } from './factory.js'
import { loadConfig } from './config/loader.ts'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './config/profiles.ts'
import { setResolvedConfig } from './config/store.ts'
import { renderLogo } from './lib/logo.ts'
import { rewriteTopLevelAliases } from './completion/argv-aliases.ts'
import { registerCompletionCommands, COMPLETION_COMMAND_NAMES } from './completion/index.ts'

// x-release-please-start-version
const VERSION = '0.1.1';
// x-release-please-end

const program = new Command()

program
  .name('elastic')
  .description('Interface with the Elastic Stack and Elastic Cloud from the command line.')
  .version(VERSION, '-V, --version', 'Print the Elastic CLI version')
  .option('--config-file <path>', 'path to a config file (default: ~/.elasticrc.yml)')
  .option('--use-context <name>', 'override the active context from the config file')
  .option(`--command-profile <name>`, `restrict available commands to a deployment profile (${BUILT_IN_PROFILES.join(', ')})`)
  .option('--json', 'output as JSON')
  .option('--output-fields <list>', 'comma-separated list of fields to include in output (dot-notation supported)')
  .option('--output-template <string>', 'Mustache-like template for custom text output (e.g. "{{id}}: {{name}}")')

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit -- never let a config failure
// silently propagate into the command handler.
//
// When no --config-file or --use-context overrides are specified, loadConfig()
// returns the in-process cached result from the early load, avoiding redundant I/O.
program.hook('preAction', async (thisCommand, actionCommand) => {
  if (actionCommand.name() === 'version') return
  // Shell completion commands must not depend on a working config: the user
  // installs them before any context exists, and tab-completion errors must
  // never poison the shell. They do their own (best-effort) config loading
  // inside their handlers when they need context names.
  if (COMPLETION_COMMAND_NAMES.includes(actionCommand.name())) return
  // `status` loads the config itself so a partially broken config is reported as
  // a structured result rather than exiting before any probe runs.
  if (actionCommand.name() === 'status') return
  if (actionCommand.parent?.name() === 'docs') return
  if (actionCommand.parent?.name() === 'sanitize') return
  // `config` commands author the config file itself — loading it would be
  // circular (and must tolerate the absence of a file)
  for (let c = actionCommand.parent; c != null; c = c.parent) {
    if (c.name() === 'config') return
  }
  // `extension` commands manage the extension registry, not the Elastic stack
  for (let c = actionCommand.parent; c != null; c = c.parent) {
    if (c.name() === 'extension') return
  }
  const { configFile: configPath, useContext: contextName, commandProfile: profileName } = thisCommand.opts()
  const typedProfileName = profileName as BuiltInProfile | undefined
  const hasOverrides = configPath != null || contextName != null || profileName != null

  const result = await loadConfig({
    ...(configPath != null && { configPath }),
    ...(contextName != null && { contextName }),
    ...(typedProfileName != null && { profileName: typedProfileName }),
    refresh: hasOverrides,
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

// Shell completion: `elastic completion <shell>` prints a wrapper script and
// the hidden `__complete` command answers tab-completion callbacks from that
// wrapper. Both are config-free; the preAction hook above skips them.
for (const cmd of registerCompletionCommands()) {
  program.addCommand(cmd)
}

// Lazily load command trees only when the relevant top-level subcommand is actually
// invoked. For all other invocations (including `elastic --help`), a lightweight stub
// is registered so the group appears in help text without paying the cost of loading
// and compiling all API schemas.
const { operands } = program.parseOptions(process.argv.slice(2))
let firstArg = operands[0]

// Transparent aliases: `elastic es ...` and `elastic kb ...` are first-class
// shortcuts for `elastic stack es ...` and `elastic stack kb ...`.
// argv is rewritten before Commander parses so all routing and dot-paths remain
// consistent (e.g. policy entries still use `stack.es.*`).
const aliasRewritten = rewriteTopLevelAliases(operands)
if (aliasRewritten.length !== operands.length) {
  // Find the position of the first operand in process.argv by scanning past
  // options and their values. We can't use indexOf because an option value
  // might coincidentally equal the alias (e.g. --command-profile es).
  const original = firstArg!
  
  // Build set of options that take values from the program's option definitions
  const valueOptions = new Set<string>()
  for (const opt of program.options) {
    if (opt.required || opt.optional) {
      // Option takes a value
      if (opt.long) valueOptions.add(opt.long)
      if (opt.short) valueOptions.add(opt.short)
    }
  }
  
  let idx = 2  // start after 'node' and script name
  while (idx < process.argv.length) {
    const arg = process.argv[idx]
    if (arg == null) break  // defensive: should never happen given loop condition
    if (arg === original) {
      // Found the first operand
      process.argv.splice(idx, 0, 'stack')
      break
    }
    // Skip this argument
    idx++
    // If it's an option that takes a value, skip the value too
    if (arg.startsWith('-')) {
      const eqIdx = arg.indexOf('=')
      if (eqIdx === -1) {
        // No = sign, check if this option takes a value
        if (valueOptions.has(arg)) {
          idx++  // skip the value
        }
      }
      // else: --option=value format, value is already part of this arg
    }
  }
  operands.splice(0, 0, 'stack')
  firstArg = 'stack'
}

if (firstArg === 'stack') {
  const stackChildren: OpaqueCommandHandle[] = []

  const secondArg = operands[1]
  const esArgs = new Set(['es', 'elasticsearch'])
  const kbArgs = new Set(['kb', 'kibana'])

  if (secondArg == null || esArgs.has(secondArg)) {
    const { registerEsCommandsLazy } = await import('./es/register.ts')
    const esGroup = await registerEsCommandsLazy()
    esGroup.alias('elasticsearch')
    stackChildren.push(esGroup)
  } else {
    const esStub = defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' })
    esStub.alias('elasticsearch')
    stackChildren.push(esStub)
  }

  if (secondArg == null || kbArgs.has(secondArg)) {
    const { registerKbCommandsLazy } = await import('./kb/register.ts')
    const kbGroup = await registerKbCommandsLazy()
    kbGroup.alias('kibana')
    stackChildren.push(kbGroup)
  } else {
    const kbStub = defineGroup({ name: 'kb', description: 'Interact with the Kibana API' })
    kbStub.alias('kibana')
    stackChildren.push(kbStub)
  }

  program.addCommand(defineGroup(
    { name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' },
    ...stackChildren
  ))
} else {
  program.addCommand(defineGroup({ name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' }))
}

// Register top-level es|elasticsearch and kb|kibana stubs so they appear in
// `elastic --help` as first-class aliases. When invoked, argv has already been
// rewritten above so Commander routes through `stack es` / `stack kb`.
const esAlias = defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' })
esAlias.alias('elasticsearch')
program.addCommand(esAlias)

const kbAlias = defineGroup({ name: 'kb', description: 'Interact with the Kibana API' })
kbAlias.alias('kibana')
program.addCommand(kbAlias)

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

if (firstArg === 'config') {
  const { registerConfigCommands } = await import('./config/commands.ts')
  program.addCommand(registerConfigCommands())
} else {
  program.addCommand(defineGroup({ name: 'config', description: 'Author and maintain the elastic config file' }))
}

if (firstArg === 'sanitize') {
  const { registerSanitizeCommands } = await import('./sanitize/register.ts')
  program.addCommand(registerSanitizeCommands())
} else {
  program.addCommand(defineGroup({ name: 'sanitize', description: 'Sanitize values for safe use in Elasticsearch' }))
}

if (firstArg === 'extension') {
  const { registerExtensionCommands } = await import('./extension/register.ts')
  program.addCommand(registerExtensionCommands())
} else {
  program.addCommand(defineGroup({ name: 'extension', description: 'Manage elastic CLI extensions' }))
}

if (firstArg === 'status') {
  const { registerStatusCommand } = await import('./status/register.ts')
  program.addCommand(registerStatusCommand())
} else {
  // Stub: a leaf command that appears in --help without paying the import cost.
  // The lazy branch above fires whenever `status` is the first arg, so the stub
  // handler is never invoked.
  program.addCommand(defineCommand({
    name: 'status',
    description: 'Verify connectivity and authentication for the active context',
    handler: () => '',
  }))
}

// Load config early so --help can hide blocked commands. Skip for commands
// that don't need config (e.g. `version`, `sanitize`, `config` which authors
// the file, and the completion subsystem which runs before any context exists)
// to avoid unnecessary file I/O and a confusing "no config found" path.
// loadConfig() caches the result in-process; the preAction hook reuses it via the default cache path.
const SKIP_EARLY_CONFIG = new Set<string>([
  'version', 'config', 'sanitize', 'extension', 'status', ...COMPLETION_COMMAND_NAMES,
])
if (firstArg == null || !SKIP_EARLY_CONFIG.has(firstArg)) {
  // Parse --profile early (before Commander's full parse) so the early config load
  // and hideBlockedCommands can apply the correct profile-based allow-list to --help.
  const profileArgIdx = process.argv.indexOf('--command-profile')
  const earlyProfile = profileArgIdx !== -1 ? process.argv[profileArgIdx + 1] as BuiltInProfile | undefined : undefined

  const earlyConfig = await loadConfig({
    ...(earlyProfile != null && { profileName: earlyProfile }),
  })
  if (earlyConfig.ok) {
    setResolvedConfig(earlyConfig.value)
    hideBlockedCommands(program, earlyConfig.value.commands)
  }
}

if (process.argv.slice(2).length === 0) {
  const earlyConfig = await loadConfig()
  if (!earlyConfig?.ok || earlyConfig.value.banner !== false) {
    process.stdout.write(renderLogo(VERSION))
  }
  program.outputHelp()
  process.exit(0)
}

// If the first argument does not match any built-in command, attempt to
// dispatch to an installed extension named `elastic-<firstArg>`.
// Derived from registered commands so it never goes stale.
const BUILT_IN_COMMANDS = new Set(program.commands.flatMap(c => [c.name()].concat(c.aliases())))

if (firstArg != null && !BUILT_IN_COMMANDS.has(firstArg)) {
  const { findExtension } = await import('./extension/store.ts')
  const ext = await findExtension(firstArg)
  if (ext != null) {
    const { buildContextEnv } = await import('./extension/context.ts')
    const { runExtension } = await import('./extension/runner.ts')
    const cachedConfig = await loadConfig()
    const contextEnv = cachedConfig?.ok === true ? buildContextEnv(cachedConfig.value) : {}
    const exitCode = await runExtension(ext, process.argv.slice(3), contextEnv)
    process.exit(exitCode)
  }
}

await program.parseAsync(process.argv)
