/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hidden `__complete` command: produces shell completion candidates for the
 * partially-typed `elastic` command line passed after `--`.
 *
 * Designed to be invoked by the shell wrappers emitted by
 * `elastic completion <shell>`. The handler:
 *
 * 1. Reads `process.argv` directly, slicing from the first `--` so that
 *    incomplete words like `--use-context` are preserved verbatim (Commander
 *    would otherwise treat them as options to `__complete` itself).
 * 2. Rewrites top-level aliases (`es`/`kb` → `stack es`/`stack kb`) via
 *    {@link rewriteTopLevelAliases} so completion mirrors the runtime
 *    routing of `cli.ts`.
 * 3. Builds a transient Commander tree containing only the subtree(s)
 *    implied by the first rewritten word. Untouched groups are registered
 *    as stubs so they still appear as top-level candidates.
 * 4. Best-effort: applies any `commands.blocked` policy from the active
 *    config so that user-restricted commands do not appear as candidates.
 *    Configuration failures are swallowed.
 * 5. Delegates to {@link enumerate} for the actual matching logic, then
 *    serialises the result as `candidate\n...\n:DIRECTIVE\n` on stdout.
 *
 * Exit code is always 0: a broken completion path must never poison the
 * shell. Errors trigger an empty candidate set with `DIRECTIVE_NO_FILE_COMP`.
 */

import { Command } from 'commander'
import { defineGroup, hideBlockedCommands } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { rewriteTopLevelAliases } from './argv-aliases.ts'
import { enumerate, DIRECTIVE_NO_FILE_COMP } from './enumerate.ts'
import { defaultRegistry } from './registry.ts'
import {
  discoverConfigFile,
  loadConfigFile,
  resolveEffectiveCommands,
} from '../config/loader.ts'
import { StructuralConfigSchema, CommandPolicySchema } from '../config/schema.ts'
import type { CommandPolicy } from '../config/types.ts'

/** Words recognised as the user-facing form of the `stack es` subtree. */
const ES_ALIASES = new Set(['es', 'elasticsearch'])
/** Words recognised as the user-facing form of the `stack kb` subtree. */
const KB_ALIASES = new Set(['kb', 'kibana'])
const ENV_CONFIG_FILE = 'ELASTIC_CLI_CONFIG_FILE'

/**
 * Loads the effective command policy for completion without resolving config
 * expressions.
 *
 * The completion path only needs command visibility rules, so it reuses the
 * structural config parse plus direct `CommandPolicySchema` validation on the
 * root and active-context `commands` fields. Any missing file, invalid config,
 * or invalid policy returns `undefined` so shell completion remains best-effort.
 */
async function loadCompletionCommandPolicy (): Promise<CommandPolicy | undefined> {
  const envPath = process.env[ENV_CONFIG_FILE]
  const path = envPath != null && envPath.length > 0
    ? envPath
    : await discoverConfigFile()
  if (path == null) return undefined

  const raw = await loadConfigFile(path)
  const structural = StructuralConfigSchema.safeParse(raw)
  if (!structural.success) return undefined

  const { current_context, contexts, commands: rawRootCommands, default_profile: rawDefaultProfile } = structural.data
  const rawContext = contexts[current_context]
  if (rawContext == null) return undefined

  let defaultProfile
  if (rawDefaultProfile != null) {
    const defaultProfileParsed = CommandPolicySchema.shape.profile.safeParse(rawDefaultProfile)
    if (!defaultProfileParsed.success) return undefined
    defaultProfile = defaultProfileParsed.data
  }

  let rootCommands: CommandPolicy | undefined
  if (rawRootCommands != null) {
    const rootCommandsParsed = CommandPolicySchema.safeParse(rawRootCommands)
    if (!rootCommandsParsed.success) return undefined
    rootCommands = rootCommandsParsed.data
  }

  let contextCommands: CommandPolicy | undefined
  if (rawContext.commands != null) {
    const contextCommandsParsed = CommandPolicySchema.safeParse(rawContext.commands)
    if (!contextCommandsParsed.success) return undefined
    contextCommands = contextCommandsParsed.data
  }

  // Completion does not inspect a `--profile` override, so config policy is
  // merged exactly as it appears in the discovered file.
  const effective = resolveEffectiveCommands(contextCommands, rootCommands, defaultProfile, undefined)
  if ('error' in effective) return undefined
  return effective.commands
}

/**
 * Constructs the `stack` group with conditional loading of the es/kb subtrees.
 *
 * `secondWord` selects which child to deep-load:
 *   - exact `es`/`elasticsearch`  → load es, kb stays a stub
 *   - exact `kb`/`kibana`         → load kb, es stays a stub
 *   - anything else (incl. empty) → both remain stubs
 *
 * Stubs still expose their names + aliases so `elastic stack <tab>` lists
 * the expected children without paying the cost of loading any schemas.
 */
async function buildStackGroup (secondWord: string | undefined): Promise<OpaqueCommandHandle> {
  let esGroup: OpaqueCommandHandle
  let kbGroup: OpaqueCommandHandle

  if (secondWord != null && ES_ALIASES.has(secondWord)) {
    const { registerEsCommandsLazy } = await import('../es/register.ts')
    esGroup = await registerEsCommandsLazy()
    esGroup.alias('elasticsearch')
  } else {
    esGroup = defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' })
    esGroup.alias('elasticsearch')
  }

  if (secondWord != null && KB_ALIASES.has(secondWord)) {
    const { registerKbCommandsLazy } = await import('../kb/register.ts')
    kbGroup = await registerKbCommandsLazy()
    kbGroup.alias('kibana')
  } else {
    kbGroup = defineGroup({ name: 'kb', description: 'Interact with the Kibana API' })
    kbGroup.alias('kibana')
  }

  return defineGroup(
    { name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' },
    esGroup,
    kbGroup,
  )
}

/**
 * Builds a transient Commander tree suitable for completion enumeration.
 *
 * The tree always contains every visible top-level group (as stubs by
 * default), so `elastic <tab>` always shows the full set of options. Subtrees
 * are deep-loaded only when the first rewritten word matches their root, to
 * keep the common no-arg-tab case lightweight.
 *
 * Exported for tests so the lazy-loading logic can be exercised without
 * spawning the CLI.
 *
 * @param rewrittenWords - words after passing through {@link rewriteTopLevelAliases}
 */
export async function buildCompletionTree (rewrittenWords: readonly string[]): Promise<Command> {
  const root = new Command('elastic')
  // Root globals: mirror the option set declared in src/cli.ts so flag
  // completion (`--js<tab>` → `--json`) sees the same surface area at every
  // depth as the real invocation path.
  root.option('--config-file <path>', 'path to a config file')
  root.option('--use-context <name>', 'override the active context from the config file')
  root.option('--command-profile <name>', 'restrict available commands to a deployment profile')
  root.option('--json', 'output as JSON')
  root.option('--output-fields <list>', 'comma-separated list of fields to include in output')
  root.option('--output-template <string>', 'Mustache-like template for custom text output')

  // `version` is registered as a stub so it appears as a top-level candidate.
  // The real version handler is wired in src/cli.ts; for enumeration we only
  // need the name to be discoverable.
  root.addCommand(defineGroup({ name: 'version', description: 'Print the elastic CLI version' }))

  const firstWord = rewrittenWords[0]
  const secondWord = rewrittenWords[1]

  // `stack` — conditional deep-load of es/kb based on second word.
  root.addCommand(await buildStackGroup(firstWord === 'stack' ? secondWord : undefined))

  // Top-level es/kb aliases — purely for visibility at the root level.
  // Navigation through them is handled via the alias rewrite (which turns
  // `es ...` into `stack es ...` before walking).
  const esTopAlias = defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' })
  esTopAlias.alias('elasticsearch')
  root.addCommand(esTopAlias)

  const kbTopAlias = defineGroup({ name: 'kb', description: 'Interact with the Kibana API' })
  kbTopAlias.alias('kibana')
  root.addCommand(kbTopAlias)

  // `cloud` — deep-load on exact match, stub otherwise.
  if (firstWord === 'cloud') {
    const { registerCloudCommands } = await import('../cloud/register.ts')
    root.addCommand(registerCloudCommands())
  } else {
    root.addCommand(defineGroup({ name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' }))
  }

  // `docs` — deep-load on exact match, stub otherwise.
  if (firstWord === 'docs') {
    const { registerDocsCommands } = await import('../docs/register.ts')
    root.addCommand(registerDocsCommands())
  } else {
    root.addCommand(defineGroup({ name: 'docs', description: 'Search, read, and ask questions about Elastic documentation' }))
  }

  // `config` — deep-load on exact match, stub otherwise.
  if (firstWord === 'config') {
    const { registerConfigCommands } = await import('../config/commands.ts')
    root.addCommand(registerConfigCommands())
  } else {
    root.addCommand(defineGroup({ name: 'config', description: 'Author and maintain the elastic config file' }))
  }

  // `sanitize` is synchronous + lightweight — always load it.
  const { registerSanitizeCommands } = await import('../sanitize/register.ts')
  root.addCommand(registerSanitizeCommands())

  // `completion` placeholder so the command appears as a top-level candidate.
  // The real handler is wired in src/cli.ts; for enumeration we only need
  // the name to be present.
  root.addCommand(defineGroup({ name: 'completion', description: 'Print a shell completion script' }))

  return root
}

/**
 * Sink that receives the completion protocol output. Tests provide a buffer-
 * backed writer to avoid monkey-patching `process.stdout`, which would also
 * swallow the test runner's own progress output.
 */
export type CompletionWriter = (chunk: string) => void

const defaultWriter: CompletionWriter = (chunk) => { process.stdout.write(chunk) }

/**
 * Runs the completion pipeline for the given words and emits the result via
 * `writer` in the protocol the shell wrappers expect (`candidate\n`...`:N\n`).
 *
 * Exported so tests can assert on the serialised output without spawning the
 * CLI. Production callers omit `writer` to fall through to `process.stdout`.
 */
export async function handleComplete (
  words: readonly string[],
  writer: CompletionWriter = defaultWriter,
): Promise<void> {
  try {
    const rewritten = rewriteTopLevelAliases(words)
    const root = await buildCompletionTree(rewritten)

    // Apply blocked-command policy if a config is readable. Any failure here
    // (missing config, invalid YAML, network-bound expression) is silently
    // ignored — completion availability must not depend on a working config.
    try {
      hideBlockedCommands(root, await loadCompletionCommandPolicy())
    } catch { /* swallowed by design */ }

    const result = await enumerate(root, rewritten, defaultRegistry)

    let out = ''
    for (const c of result.candidates) out += c + '\n'
    out += `:${result.directive}\n`
    writer(out)
  } catch {
    writer(`:${DIRECTIVE_NO_FILE_COMP}\n`)
  }
}

/**
 * Constructs the hidden `__complete` Commander command.
 *
 * The command is registered with `_hidden` so it does not appear in help
 * output or in its own completion candidates. It accepts a variadic
 * positional `[words...]` so `elastic __complete -- <word> <word>` passes
 * the raw arguments through to {@link handleComplete}; the `--` separator
 * disables option parsing on Commander's side.
 */
export function buildCompleteCommand (): Command {
  const cmd = new Command('__complete')
  cmd.description('(internal) Compute shell completion candidates')
  cmd.allowUnknownOption(true)
  cmd.allowExcessArguments(true)
  cmd.argument('[words...]', 'words to complete (passed after --)')
  // Commander does not expose `_hidden` in its public typings, but the
  // factory and help renderer both use it as the hidden discriminator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(cmd as unknown as any)._hidden = true

  cmd.action(async (words: string[] | undefined) => {
    // Prefer the raw argv slice after `--` so option-like tokens
    // (`--use-context`) are preserved verbatim even if a future Commander
    // version changes how positional args interact with allowUnknownOption.
    const argv = process.argv
    const dashIdx = argv.indexOf('--')
    const tokens = dashIdx !== -1 ? argv.slice(dashIdx + 1) : (words ?? [])
    await handleComplete(tokens)
  })
  return cmd
}
