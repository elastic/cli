#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup, hideBlockedCommands, configureJsonHelp } from './factory.js'
import type { OpaqueCommandHandle } from './factory.js'
import { loadConfig } from './config/loader.ts'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './config/profiles.ts'
import { setResolvedConfig } from './config/store.ts'
import { renderLogo } from './lib/logo.ts'
import { registerCompletionCommands, COMPLETION_COMMAND_NAMES } from './completion/index.ts'
import { NAMESPACES } from './namespaces.ts'

// x-release-please-start-version
const VERSION = '0.2.0';
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

configureJsonHelp(program)

// Before every sub-command action, load and resolve the config file.
// On error, print a structured message and exit -- never let a config failure
// silently propagate into the command handler.
//
const skipConfigNames = new Set(NAMESPACES.filter(ns => ns.requiresContext === false).map(ns => ns.name))

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
  // Walk up the command tree — if any ancestor doesn't require context, skip config loading.
  for (let c: Command | null = actionCommand; c != null; c = c.parent) {
    if (skipConfigNames.has(c.name())) return
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

// Build a map of shortcut `from` names to the top-level namespace they belong to,
// so argv can be rewritten before Commander parses.
const allShortcuts = NAMESPACES.flatMap(ns => (ns.shortcuts ?? []).map(s => ({ ...s, nsName: ns.name })))
const shortcutMap = new Map(allShortcuts.map(s => [s.from, s]))

// Transparent argv rewrite: `elastic es ...` becomes `elastic stack es ...`.
// Done before Commander parses so routing, dot-paths, and option parsing are consistent.
const shortcutMatch = firstArg != null ? shortcutMap.get(firstArg) : undefined
if (shortcutMatch != null) {
  const parentNs = shortcutMatch.to[0]
  if (parentNs != null) {
    // Scan forward past options and their values to find the first positional arg.
    // Simple indexOf would incorrectly match a shortcut name used as an option value
    // (e.g. --command-profile es).
    const valueOptions = new Set(program.options.filter(o => o.required || o.optional).flatMap(o => [o.long, o.short].filter(Boolean) as string[]))
    let idx = 2
    while (idx < process.argv.length) {
      const arg = process.argv[idx]
      if (arg == null) break
      if (arg === firstArg) { process.argv.splice(idx, 0, parentNs); break }
      idx++
      if (arg.startsWith('-') && arg.indexOf('=') === -1 && valueOptions.has(arg)) idx++
    }
    operands.splice(0, 0, parentNs)
    firstArg = parentNs
  }
}

// Register namespaces: load eagerly when first arg matches, otherwise register a lightweight stub.
// To add a new top-level namespace, add an entry to src/namespaces.ts — no changes needed here.
for (const ns of NAMESPACES) {
  if (firstArg === ns.name) {
    program.addCommand(await ns.load({ version: VERSION, rootProgram: program }))
  } else {
    program.addCommand(defineGroup({ name: ns.name, description: ns.description }))
  }
}

// Register root-level shortcut stubs derived from NAMESPACES so they appear in
// `elastic --help`. Group by `to` path so multiple `from` names for the same
// target become Commander aliases of a single stub rather than separate commands.
// Argv has already been rewritten above so Commander routes correctly.
const stubsByTarget = new Map<string, OpaqueCommandHandle>()
for (const shortcut of allShortcuts) {
  const targetKey = shortcut.to.join('.')
  const existing = stubsByTarget.get(targetKey)
  if (existing == null) {
    const description = `Shortcut for 'elastic ${shortcut.to.join(' ')}'`
    const stub = defineGroup({ name: shortcut.from, description })
    stubsByTarget.set(targetKey, stub)
    program.addCommand(stub)
  } else {
    existing.alias(shortcut.from)
  }
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

// Load config early so --help can hide blocked commands. Skip for commands that don't need
// config (requiresContext: false namespaces, extension, status, version, or completion commands) to
// avoid unnecessary file I/O and a confusing 'no config found' path.
// loadConfig() caches the result in-process; the preAction hook reuses it via the default cache path.
const SKIP_EARLY_CONFIG = new Set<string>([
  'version', 'extension', 'status', ...COMPLETION_COMMAND_NAMES, ...skipConfigNames,
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
