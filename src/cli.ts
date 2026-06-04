#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { hideBlockedCommands, configureJsonHelp, hasGlobalJsonFlag } from './factory-core.js'
import type { OpaqueCommandHandle } from './factory-core.ts'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './config/profiles.ts'
import { NAMESPACES } from './namespaces.ts'
import type { LoadConfigResult } from './config/loader.ts'

// Lazy-loaded modules
const _require = createRequire(import.meta.url)

let _renderLogo: ((v: string) => string) | null = null
function getRenderLogo (): (v: string) => string {
  if (_renderLogo == null) _renderLogo = (_require('./lib/logo.js') as typeof import('./lib/logo.ts')).renderLogo
  return _renderLogo
}

// Argv pre-scan (single pass to detect flags, help, and operands)
const argv = process.argv.slice(2)
let hasGlobalFlags = false
let wantsHelp = false
const operandsFromScan: string[] = []
for (const arg of argv) {
  if (arg === '--help' || arg === '-h') wantsHelp = true
  else if (arg.charCodeAt(0) === 45) { // starts with '-'
    if (arg.charCodeAt(1) === 45 && arg !== '--json') hasGlobalFlags = true
  } else operandsFromScan.push(arg)
}

// x-release-please-start-version
const VERSION = '0.2.0';
// x-release-please-end

const program = new Command()

program
  .name('elastic')
  .description('Interface with the Elastic Stack and Elastic Cloud from the command line.')

// Register global options only when argv actually contains them (common case: it doesn't)
if (hasGlobalFlags) {
  program
    .option('--config-file <path>', 'path to a config file (default: ~/.elasticrc.yml)')
    .option('--use-context <name>', 'override the active context from the config file')
    .option(`--command-profile <name>`, `restrict available commands to a deployment profile (${BUILT_IN_PROFILES.join(', ')})`)
    .option('--output-fields <list>', 'comma-separated list of fields to include in output (dot-notation supported)')
    .option('--output-template <string>', 'Mustache-like template for custom text output (e.g. "{{id}}: {{name}}")')
}
program.option('--json', 'output as JSON')

// preAction hook (skipped for --help paths since the hook never fires)
if (!wantsHelp) {
  program.hook('preAction', async (thisCommand, actionCommand) => {
    const skipActionNames: ReadonlySet<string> = new Set(['version', 'completion', '__complete', 'status'])
    if (skipActionNames.has(actionCommand.name())) return
    // Groups with no sub-command will just call group.help() — no real action fires.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((actionCommand as any)._isGroup === true && actionCommand.args.length === 0) return

    const skipConfigNames: ReadonlySet<string> = new Set(['docs', 'config', 'sanitize', 'cli-schema'])
    for (let c: Command | null = actionCommand; c != null; c = c.parent) {
      if (skipConfigNames.has(c.name())) return
    }

    for (let c = actionCommand.parent; c != null; c = c.parent) {
      if (c.name() === 'extension') return
    }

    const { configFile: configPath, useContext: contextName, commandProfile: profileName } = thisCommand.opts()
    const typedProfileName = profileName as BuiltInProfile | undefined
    const hasOverrides = configPath != null || contextName != null || profileName != null

    const { loadConfig } = await import('./config/loader.js')
    const { setResolvedConfig } = await import('./config/store.js')
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
}

// Determine first argument (namespace routing)
let operands: string[]
let firstArg: string | undefined
if (!hasGlobalFlags) {
  operands = operandsFromScan
  firstArg = operands[0]
} else {
  const parsed = program.parseOptions(argv)
  operands = parsed.operands
  firstArg = operands[0]
}

// Shortcut rewriting (e.g. `elastic es ...` to `elastic stack es ...`)
// Derived from NAMESPACES to keep a single canonical list.
const SHORTCUTS: ReadonlyMap<string, readonly string[]> = new Map(
  NAMESPACES.flatMap(ns => (ns.shortcuts ?? []).map(s => [s.from, s.to] as const))
)

const shortcutTarget = firstArg != null ? SHORTCUTS.get(firstArg) : undefined
if (shortcutTarget != null) {
  const parentNs = shortcutTarget[0]
  if (parentNs != null) {
    if (!hasGlobalFlags) {
      process.argv.splice(2, 0, parentNs)
    } else {
      const isValueOpt = (s: string): boolean =>
        s === '--config-file' || s === '--use-context' || s === '--command-profile' ||
        s === '--output-fields' || s === '--output-template'
      let idx = 2
      while (idx < process.argv.length) {
        const arg = process.argv[idx]
        if (arg == null) break
        if (arg === firstArg) { process.argv.splice(idx, 0, parentNs); break }
        idx++
        if (arg.startsWith('-') && arg.indexOf('=') === -1 && isValueOpt(arg)) idx++
      }
    }
    operands.splice(0, 0, parentNs)
    firstArg = parentNs
  }
}

// Command registration (lazy: only load the targeted namespace)

// Version and JSON help only needed for root invocations
if (firstArg == null) {
  program.version(VERSION, '-V, --version', 'Print the Elastic CLI version')
  configureJsonHelp(program)
}

// Load the targeted namespace, or register lightweight stubs for --help
const nsMap: ReadonlyMap<string, typeof NAMESPACES[0]> = new Map(NAMESPACES.map(ns => [ns.name, ns]))

if (firstArg != null) {
  const matchedNs = nsMap.get(firstArg)
  if (matchedNs != null) {
    const targetSubNamespace = operands[1]
    program.addCommand(await matchedNs.load({ version: VERSION, rootProgram: program, targetSubNamespace }))
  }
} else {
  for (const ns of NAMESPACES) {
    const stub = new Command(ns.name)
    stub.description(ns.description)
    stub.allowUnknownOption(true)
    program.addCommand(stub)
  }
}

// Completion commands
if (firstArg === 'completion' || firstArg === '__complete') {
  const { registerCompletionCommands } = await import('./completion/index.js')
  for (const cmd of registerCompletionCommands()) {
    program.addCommand(cmd)
  }
} else if (firstArg == null) {
  const completionStub = new Command('completion')
  completionStub.description('Print a shell completion script (bash, zsh, fish)')
  completionStub.allowUnknownOption(true)
  completionStub.action(async () => {
    const { registerCompletionCommands: real } = await import('./completion/index.js')
    for (const cmd of real()) { program.addCommand(cmd) }
    await program.parseAsync(process.argv)
  })
  program.addCommand(completionStub)
}

// Version command
if (firstArg == null || firstArg === 'version') {
  const versionCmd = new Command('version')
  versionCmd.description('Print the elastic CLI version')
  versionCmd.option('--json', 'Output as JSON')
  versionCmd.action(() => {
    const json = versionCmd.opts().json === true || hasGlobalJsonFlag(versionCmd)
    if (json) {
      process.stdout.write(JSON.stringify({ version: VERSION }) + '\n')
    } else {
      process.stdout.write(`Elastic CLI v${VERSION}\n`)
    }
  })
  program.addCommand(versionCmd)
}

// Shortcut stubs (only for root --help display)
if (firstArg == null) {
  const stubsByTarget = new Map<string, OpaqueCommandHandle>()
  for (const [from, to] of SHORTCUTS) {
    const targetKey = to.join('.')
    const existing = stubsByTarget.get(targetKey)
    if (existing == null) {
      const stub = new Command(from)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(stub as any).description(`Shortcut for 'elastic ${to.join(' ')}'`)
      stubsByTarget.set(targetKey, stub)
      program.addCommand(stub)
    } else {
      existing.alias(from)
    }
  }
}

// Extension commands
if (firstArg === 'extension') {
  const { registerExtensionCommands } = await import('./extension/register.ts')
  program.addCommand(registerExtensionCommands())
} else if (firstArg == null) {
  const stub = new Command('extension')
  stub.description('Manage elastic CLI extensions')
  stub.allowUnknownOption(true)
  program.addCommand(stub)
}

// Status command
if (firstArg === 'status') {
  const { registerStatusCommand } = await import('./status/register.ts')
  program.addCommand(registerStatusCommand())
} else if (firstArg == null) {
  const stub = new Command('status')
  stub.description('Verify connectivity and authentication for the active context')
  program.addCommand(stub)
}

// Early config load (for --command-profile filtering in help output)
let earlyConfig: LoadConfigResult | undefined
const hasProfileFlag = argv.includes('--command-profile')
const CONTEXT_NAMESPACES = new Set(['stack', 'cloud'])
// skip early config when Commander will just print help — no action will fire.
// operands = [namespace, subcommand?, ...rest]; a sub-subcommand is at operands[2].
const willJustPrintHelp = CONTEXT_NAMESPACES.has(firstArg ?? '') && operands.length < 3
if (firstArg != null && (!willJustPrintHelp || hasProfileFlag)) {
  const SKIP_EARLY_CONFIG: ReadonlySet<string> = new Set([
    'version', 'extension', 'status', 'completion', '__complete',
    'docs', 'config', 'sanitize', 'cli-schema',
  ])
  if (!SKIP_EARLY_CONFIG.has(firstArg)) {
    const profileArgIdx = process.argv.indexOf('--command-profile')
    const earlyProfile = profileArgIdx !== -1 ? process.argv[profileArgIdx + 1] as BuiltInProfile | undefined : undefined

    const { loadConfig } = await import('./config/loader.js')
    earlyConfig = await loadConfig({
      ...(earlyProfile != null && { profileName: earlyProfile }),
    })
    if (earlyConfig.ok) {
      const { setResolvedConfig } = await import('./config/store.js')
      setResolvedConfig(earlyConfig.value)
      hideBlockedCommands(program, earlyConfig.value.commands)
    }
  }
}

// Logo banner (root help only)
if (firstArg == null) {
  program.addHelpText('before', () =>
    process.argv.includes('--json') || (earlyConfig?.ok === true && earlyConfig.value.banner === false)
      ? '' : getRenderLogo()(VERSION).replace(/\n$/, '')
  )
}

// Bare invocation: show help
if (argv.length === 0) {
  program.outputHelp()
  process.exit(0)
}

// Extension dispatch (unrecognized first argument; try installed extension)
if (!wantsHelp && firstArg != null && !program.commands.some(c => c.name() === firstArg)) {
  const { findExtension } = await import('./extension/store.ts')
  const ext = await findExtension(firstArg)
  if (ext != null) {
    const { buildContextEnv } = await import('./extension/context.ts')
    const { runExtension } = await import('./extension/runner.ts')
    const { loadConfig: loadCfg } = await import('./config/loader.js')
    const cachedConfig = await loadCfg()
    const contextEnv = cachedConfig?.ok === true ? buildContextEnv(cachedConfig.value) : {}
    const exitCode = await runExtension(ext, process.argv.slice(3), contextEnv)
    process.exit(exitCode)
  }
}

await program.parseAsync(process.argv)
