/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import type { defineCommand as _DefCmd } from '../factory.ts'
import { defineGroup } from '../factory-core.ts'
import type { OpaqueCommandHandle } from '../factory-core.ts'
import { inferIntentFromHttp } from '@cli-schema/spec'
import type { EsApiDefinition } from './types.ts'
import { validateApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/json-schema-args.ts'
import { apiManifest } from './apis.ts'
import type { EsApiMeta } from './apis.ts'

let _dc: typeof _DefCmd | null = null
async function getDefineCommand (): Promise<typeof _DefCmd> {
  if (_dc == null) _dc = (await import('../factory.js')).defineCommand
  return _dc!
}

// Help grouping configuration
const ROOT_COMMAND_GROUPS: Readonly<Record<string, string>> = {
  ...group('Documents', ['get', 'index', 'create', 'update', 'delete', 'bulk', 'mget', 'exists', 'exists-source', 'get-source', 'delete-by-query', 'update-by-query', 'reindex']),
  ...group('Search', ['search', 'msearch', 'search-template', 'msearch-template', 'scroll', 'clear-scroll', 'open-point-in-time', 'close-point-in-time', 'search-mvt', 'search-shards', 'render-search-template']),
  ...group('Analysis', ['count', 'explain', 'field-caps', 'termvectors', 'mtermvectors', 'rank-eval', 'terms-enum']),
  ...group('Scripts', ['get-script', 'put-script', 'delete-script', 'scripts-painless-execute', 'get-script-context', 'get-script-languages']),
  ...group('Cluster', ['ping', 'info', 'health-report']),
  ...group('Advanced', ['delete-by-query-rethrottle', 'update-by-query-rethrottle', 'reindex-rethrottle']),
}

function group (label: string, cmds: string[]): Record<string, string> {
  return Object.fromEntries(cmds.map(cmd => [cmd, label]))
}

/** Group label applied to every namespace sub-tree (cat, cluster, indices, …). */
const NAMESPACE_GROUP = 'API namespaces'

const GROUP_PRIORITY: Readonly<Record<string, number>> = Object.fromEntries(
  ['Documents', 'Search', 'Analysis', 'Scripts', 'Cluster', 'Advanced', 'Other commands'].map((k, i) => [k, i])
)

/** Applies a help-section heading to a command handle (no-op if already set). */
function applyHelpGroup (handle: OpaqueCommandHandle, grp: string): OpaqueCommandHandle {
  handle.helpGroup(grp)
  return handle
}

/** Builds a leaf command handle from an eagerly-available definition and its pre-computed schema args. */
function buildLeafHandle (
  def: EsApiDefinition,
  defSchemaArgs: Map<EsApiDefinition, SchemaArgDefinition[]>,
  defineCommand: typeof _DefCmd
): OpaqueCommandHandle {
  const schemaArgs = defSchemaArgs.get(def) ?? []
  const config: Parameters<typeof _DefCmd>[0] = {
    name: def.name,
    description: def.description,
    ...(def.input !== undefined ? { input: def.input } : {}),
    readOnly: def.method === 'GET' || def.method === 'HEAD',
    handler: async (parsed) => {
      const { createEsHandler } = await import('./handler.js')
      return createEsHandler(def, schemaArgs)(parsed)
    },
    ...(def.intent != null || inferIntentFromHttp(def.method) != null
      ? { intent: def.intent ?? inferIntentFromHttp(def.method)! }
      : {}),
  }
  if (def.responseType === 'text') {
    config.formatOutput = (result) => String(result)
  }
  const bodyRootArg = schemaArgs.find(
    (a) => (a.foundIn === 'body' || a.foundIn === undefined) && a.required && a.bodyRoot === true
  )
  if (bodyRootArg != null) {
    const rootKey = bodyRootArg.schemaKey
    config.inputTransform = (input: unknown) => {
      if (input == null || typeof input !== 'object' || Array.isArray(input)) return input
      if (rootKey in (input as Record<string, unknown>)) return input
      return { [rootKey]: input }
    }
  }
  return defineCommand(config)
}

/**
 * Builds a lightweight stub leaf command: just name + description, no options,
 * and an action that lazy-loads the real definition on demand. The stub is used
 * for commands the user has NOT asked to invoke - Commander still shows them in
 * group-level help, but we never pay the cost of resolving their input schemas.
 */
function buildStubLeaf (meta: EsApiMeta): OpaqueCommandHandle {
  const cmd = new Command(meta.name)
  cmd.description(meta.description)
  cmd.allowUnknownOption(true)
  cmd.action(async () => {
    // Sniffing must have missed this leaf (shouldn't normally happen - the
    // sniffer covers every direct-leaf and namespaced-leaf form). Fall back to
    // loading the definition on demand, swapping the stub for the real leaf,
    // and re-entering Commander parse so options dispatch correctly.
    const { loadEsApi } = await import('./apis.js')
    const def = await loadEsApi(meta)
    const schemaArgs = validateApiDefinition(def)
    const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
    defSchemaArgs.set(def, schemaArgs)
    const dc = await getDefineCommand()
    const real = buildLeafHandle(def, defSchemaArgs, dc)
    const parent = cmd.parent
    if (parent != null) {
      // Commander's `commands` array is typed readonly but mutated internally;
      // splice directly to swap the stub for the real leaf.
      const list = parent.commands as Command[]
      const idx = list.indexOf(cmd)
      if (idx >= 0) list.splice(idx, 1)
      parent.addCommand(real)
      await parent.parseAsync(process.argv)
    }
  })
  return cmd
}

/**
 * Parses `process.argv` to determine which ES leaf command (if any) the user
 * intends to invoke. Returns `null` when the invocation targets top-level help,
 * a namespace group without a leaf, or the helpers subtree.
 *
 * The sniff is intentionally cheap and conservative: on ambiguity it returns
 * `null`, which falls through to the stubs-only tree (correct but skips the
 * lazy-load optimisation).
 */
function sniffInvokedLeaf (argv: readonly string[], manifest: readonly EsApiMeta[]): EsApiMeta | null {
  // Find "es" positional. It is nested under "stack" in the final CLI, but this
  // module does not care about earlier tokens - we just need the first "es"
  // that is not a flag value.
  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  if (esIdx < 0) return null
  const next = tokens[esIdx + 1]
  if (next == null || next === 'helpers') return null

  // Direct leaf form: `es <leaf>`
  const directLeaf = manifest.find((m) => m.namespace == null && m.name === next)
  if (directLeaf != null) return directLeaf

  // Namespaced leaf form: `es <namespace> <leaf>`
  const leafName = tokens[esIdx + 2]
  if (leafName == null) return null
  return manifest.find((m) => m.namespace === next && m.name === leafName) ?? null
}

/**
 * Returns the namespace token from argv if the user is targeting a specific
 * namespace (e.g. `es indices` or `es indices create`). Used to limit which
 * namespace's leaf stubs are built eagerly, keeping Commander object count low.
 */
function sniffInvokedNamespace (argv: readonly string[]): string | null {
  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  if (esIdx < 0) return null
  const next = tokens[esIdx + 1]
  if (next == null || next === 'helpers') return null
  return next
}

interface RegisterLazyOptions {
  /** argv for sniffing the invoked leaf; defaults to `process.argv`. */
  argv?: readonly string[]
}

/**
 * Synchronously registers all Elasticsearch API commands under an `es` group
 * from an explicit list of eagerly-loaded definitions.
 *
 * Primary callers are tests and any consumer that already holds every
 * `EsApiDefinition` in memory. Production startup should prefer
 * {@link registerEsCommandsLazy} to avoid resolving every input schema up-front.
 *
 * @throws {Error} if any definition fails validation or there are duplicate names at any level
 */
export async function registerEsCommands (
  definitions: EsApiDefinition[]
): Promise<OpaqueCommandHandle> {
  return buildEagerTree(definitions)
}

/**
 * Lazy production path: builds the `es` command tree from the static
 * `apiManifest` (cheap metadata only). Argv is sniffed to identify the invoked
 * leaf; only that leaf's namespace file is dynamic-imported eagerly so Commander
 * can register its schema-derived flags before parsing. Every other leaf stays as
 * a stub that lazy-loads on demand if the sniff missed.
 *
 * Keeps startup heap bounded - see #171.
 */
export async function registerEsCommandsLazy (
  opts: RegisterLazyOptions = {}
): Promise<OpaqueCommandHandle> {
  return buildLazyTree(apiManifest, opts.argv ?? process.argv)
}

/**
 * Eager path: loads ALL Elasticsearch API definitions upfront and registers
 * them as full `defineCommand` commands with all options.
 * Use this when you need the complete command tree (e.g. schema generation).
 * Callers that only need CLI startup should prefer {@link registerEsCommandsLazy}.
 */
export async function registerEsCommandsEager (): Promise<OpaqueCommandHandle> {
  const { loadAllEsApis } = await import('./apis.js')
  const defs = await loadAllEsApis()
  return buildEagerTree(defs)
}

/** Eager-tree builder: behaviourally identical to the original pre-lazy implementation. */
async function buildEagerTree (definitions: EsApiDefinition[]): Promise<OpaqueCommandHandle> {
  const defineCommand = await getDefineCommand()
  const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
  for (const def of definitions) {
    defSchemaArgs.set(def, validateApiDefinition(def))
  }

  const byNamespace = new Map<string, EsApiDefinition[]>()
  const rootDefs: EsApiDefinition[] = []
  for (const def of definitions) {
    if (def.namespace !== undefined) {
      let grp = byNamespace.get(def.namespace)
      if (grp == null) { grp = []; byNamespace.set(def.namespace, grp) }
      grp.push(def)
    } else {
      rootDefs.push(def)
    }
  }

  const topLevelNames = new Set<string>()
  const namespaceHandles: OpaqueCommandHandle[] = []

  for (const [namespace, defs] of byNamespace) {
    if (topLevelNames.has(namespace)) throw new Error(`duplicate command name "${namespace}" at the top level of es`)
    topLevelNames.add(namespace)

    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      seen.add(def.name)
    }

    const leafHandles = defs.map((def) => buildLeafHandle(def, defSchemaArgs, defineCommand))
    const nsHandle = defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    applyHelpGroup(nsHandle, NAMESPACE_GROUP)
    namespaceHandles.push(nsHandle)
  }

  rootDefs.sort((a, b) => {
    const pa = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[a.name] ?? 'Other commands'] ?? 99
    const pb = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[b.name] ?? 'Other commands'] ?? 99
    return pa - pb || a.name.localeCompare(b.name)
  })

  const rootHandles: OpaqueCommandHandle[] = []
  for (const def of rootDefs) {
    if (topLevelNames.has(def.name)) throw new Error(`duplicate command name "${def.name}" at the top level of es`)
    topLevelNames.add(def.name)
    const h = buildLeafHandle(def, defSchemaArgs, defineCommand)
    applyHelpGroup(h, ROOT_COMMAND_GROUPS[def.name] ?? 'Other commands')
    rootHandles.push(h)
  }

  // Stub for helpers; actual helpers sub-commands are loaded on demand via stub-swap.
  const helpersGroup = defineGroup({ name: 'helpers', description: 'High-level helper commands for common Elasticsearch workflows' })
  applyHelpGroup(helpersGroup, 'Helpers')

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}

/**
 * Lazy-tree builder: registers stubs for every manifest entry and, if argv
 * identifies an invoked leaf, eagerly replaces that leaf's stub with its full
 * `defineCommand`. All other leaves remain stubs.
 */
async function buildLazyTree (manifest: readonly EsApiMeta[], argv: readonly string[]): Promise<OpaqueCommandHandle> {
  const invoked = sniffInvokedLeaf(argv, manifest)
  // The namespace the user is targeting (may or may not have a specific leaf).
  // We only fully expand leaf stubs for this namespace; all others get an empty
  // group stub to keep Commander object count low at startup.
  const invokedNamespace = sniffInvokedNamespace(argv)

  // Pre-load the invoked leaf's definition so Commander can register real flags
  // before parsing (so `--help` shows them and unknown flags error as usual).
  // This is the ONE synchronous schema load per invocation - every other leaf
  // stays a stub.
  let invokedDef: EsApiDefinition | null = null
  if (invoked != null) {
    const { loadEsApi } = await import('./apis.js')
    invokedDef = await loadEsApi(invoked)
  }

  const invokedSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
  if (invokedDef != null) {
    invokedSchemaArgs.set(invokedDef, validateApiDefinition(invokedDef))
  }

  const byNamespace = new Map<string, EsApiMeta[]>()
  const rootMetas: EsApiMeta[] = []
  for (const m of manifest) {
    if (m.namespace != null) {
      let grp = byNamespace.get(m.namespace)
      if (grp == null) { grp = []; byNamespace.set(m.namespace, grp) }
      grp.push(m)
    } else {
      rootMetas.push(m)
    }
  }

  async function leafHandleFor (m: EsApiMeta): Promise<OpaqueCommandHandle> {
    if (invoked != null && invokedDef != null && m === invoked) {
      // Only load factory.ts (defineCommand) when a specific leaf is actually invoked.
      const dc = await getDefineCommand()
      return buildLeafHandle(invokedDef, invokedSchemaArgs, dc)
    }
    return buildStubLeaf(m)
  }

  const topLevelNames = new Set<string>()
  const namespaceHandles: OpaqueCommandHandle[] = []

  for (const [namespace, metas] of byNamespace) {
    if (topLevelNames.has(namespace)) throw new Error(`duplicate command name "${namespace}" at the top level of es`)
    topLevelNames.add(namespace)

    // Only build leaf stubs for the namespace the user is actually targeting.
    // All other namespaces get an empty group; stubs are added on-demand if the
    // user navigates to them (e.g. via the stub's action handler fall-through).
    // This keeps Commander object count proportional to the invoked namespace
    // size (worst case ~70 stubs) rather than the total manifest size (~560).
    if (namespace !== invokedNamespace) {
      const stubHandle = defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` })
      applyHelpGroup(stubHandle, NAMESPACE_GROUP)
      namespaceHandles.push(stubHandle)
      continue
    }

    const seen = new Set<string>()
    for (const m of metas) {
      if (seen.has(m.name)) throw new Error(`duplicate command name "${m.name}" in namespace "${namespace}"`)
      seen.add(m.name)
    }

    const leafHandles = await Promise.all(metas.map(leafHandleFor))
    const nsHandle = defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    applyHelpGroup(nsHandle, NAMESPACE_GROUP)
    namespaceHandles.push(nsHandle)
  }

  // Root-level commands: only build stubs when the user targets root-level.
  // When a namespace is targeted, root stubs are skipped entirely.
  const rootHandles: OpaqueCommandHandle[] = []
  if (invokedNamespace == null || !byNamespace.has(invokedNamespace)) {
    rootMetas.sort((a, b) => {
      const pa = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[a.name] ?? 'Other commands'] ?? 99
      const pb = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[b.name] ?? 'Other commands'] ?? 99
      return pa - pb || a.name.localeCompare(b.name)
    })
    // Check for duplicate names before parallel construction:
    for (const m of rootMetas) {
      if (topLevelNames.has(m.name)) throw new Error(`duplicate command name "${m.name}" at the top level of es`)
      topLevelNames.add(m.name)
    }
    // Build root leaf stubs in parallel (all become buildStubLeaf → Commander Command):
    const rootStubs = await Promise.all(rootMetas.map(async m => {
      const h = await leafHandleFor(m)
      applyHelpGroup(h, ROOT_COMMAND_GROUPS[m.name] ?? 'Other commands')
      return h
    }))
    rootHandles.push(...rootStubs)
  }

  // Use the real helpers group only when the user is targeting helpers; otherwise a
  // lightweight stub suffices (sub-commands load on demand via stub-swap in buildStubLeaf).
  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  const isHelpersInvoked = esIdx >= 0 && tokens[esIdx + 1] === 'helpers'
  const helpersGroup = isHelpersInvoked
    ? (await import('./helpers/register.js')).registerHelperCommands()
    : defineGroup({ name: 'helpers', description: 'High-level helper commands for common Elasticsearch workflows' })
  applyHelpGroup(helpersGroup, 'Helpers')

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}
