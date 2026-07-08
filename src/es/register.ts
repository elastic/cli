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
import { BODY_ROOT_STAR_FIELDS } from './request-builder.ts'

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

const NAMESPACE_GROUP = 'API namespaces'

const GROUP_PRIORITY: Readonly<Record<string, number>> = Object.fromEntries(
  ['Documents', 'Search', 'Analysis', 'Scripts', 'Cluster', 'Advanced', 'Other commands'].map((k, i) => [k, i])
)

function applyHelpGroup (handle: OpaqueCommandHandle, grp: string): OpaqueCommandHandle {
  handle.helpGroup(grp)
  return handle
}

/** Builds a leaf command handle from an eagerly-available definition. */
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
    (a) => (a.foundIn === 'body' || a.foundIn === undefined) && a.required && BODY_ROOT_STAR_FIELDS.has(a.schemaKey)
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

/** Builds a lightweight stub leaf that lazy-loads its full definition on demand. */
function buildStubLeaf (meta: EsApiMeta): OpaqueCommandHandle {
  const cmd = new Command(meta.name)
  cmd.description(meta.description)
  cmd.allowUnknownOption(true)
  cmd.action(async () => {
    const { loadEsApi } = await import('./apis.js')
    const def = await loadEsApi(meta)
    const schemaArgs = validateApiDefinition(def)
    const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
    defSchemaArgs.set(def, schemaArgs)
    const dc = await getDefineCommand()
    const real = buildLeafHandle(def, defSchemaArgs, dc)
    const parent = cmd.parent
    if (parent != null) {
      const list = parent.commands as Command[]
      const idx = list.indexOf(cmd)
      if (idx >= 0) list.splice(idx, 1)
      parent.addCommand(real)
      await parent.parseAsync(process.argv)
    }
  })
  return cmd
}

function sniffInvokedLeaf (argv: readonly string[], manifest: readonly EsApiMeta[]): EsApiMeta | null {
  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  if (esIdx < 0) return null
  const next = tokens[esIdx + 1]
  if (next == null || next === 'helpers') return null

  const directLeaf = manifest.find((m) => m.namespace == null && m.name === next)
  if (directLeaf != null) return directLeaf

  const leafName = tokens[esIdx + 2]
  if (leafName == null) return null
  return manifest.find((m) => m.namespace === next && m.name === leafName) ?? null
}

function sniffInvokedNamespace (argv: readonly string[]): string | null {
  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  if (esIdx < 0) return null
  const next = tokens[esIdx + 1]
  if (next == null || next === 'helpers') return null
  return next
}

interface RegisterLazyOptions {
  argv?: readonly string[]
}

/**
 * Registers all ES commands from explicit definitions (for tests/tools).
 */
export async function registerEsCommands (
  definitions: EsApiDefinition[]
): Promise<OpaqueCommandHandle> {
  return buildEagerTree(definitions)
}

/**
 * Lazy production path: builds the `es` command tree using the manifest only.
 */
export async function registerEsCommandsLazy (
  opts: RegisterLazyOptions = {}
): Promise<OpaqueCommandHandle> {
  return buildLazyTree(apiManifest, opts.argv ?? process.argv)
}

/**
 * Loads all definitions eagerly (for schema generation / complete introspection).
 */
export async function registerEsCommandsEager (): Promise<OpaqueCommandHandle> {
  const { loadAllEsApis } = await import('./apis.js')
  const defs = await loadAllEsApis()
  return buildEagerTree(defs)
}

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

  const helpersGroup = defineGroup({ name: 'helpers', description: 'High-level helper commands for common Elasticsearch workflows' })
  applyHelpGroup(helpersGroup, 'Helpers')

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}

async function buildLazyTree (manifest: readonly EsApiMeta[], argv: readonly string[]): Promise<OpaqueCommandHandle> {
  const invoked = sniffInvokedLeaf(argv, manifest)
  const invokedNamespace = sniffInvokedNamespace(argv)

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

  const rootHandles: OpaqueCommandHandle[] = []
  if (invokedNamespace == null || !byNamespace.has(invokedNamespace)) {
    rootMetas.sort((a, b) => {
      const pa = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[a.name] ?? 'Other commands'] ?? 99
      const pb = GROUP_PRIORITY[ROOT_COMMAND_GROUPS[b.name] ?? 'Other commands'] ?? 99
      return pa - pb || a.name.localeCompare(b.name)
    })
    for (const m of rootMetas) {
      if (topLevelNames.has(m.name)) throw new Error(`duplicate command name "${m.name}" at the top level of es`)
      topLevelNames.add(m.name)
    }
    const rootStubs = await Promise.all(rootMetas.map(async m => {
      const h = await leafHandleFor(m)
      applyHelpGroup(h, ROOT_COMMAND_GROUPS[m.name] ?? 'Other commands')
      return h
    }))
    rootHandles.push(...rootStubs)
  }

  const tokens = argv.slice(2).filter((t) => !t.startsWith('-'))
  const esIdx = tokens.indexOf('es')
  const isHelpersInvoked = esIdx >= 0 && tokens[esIdx + 1] === 'helpers'
  const helpersGroup = isHelpersInvoked
    ? (await import('./helpers/register.js')).registerHelperCommands()
    : defineGroup({ name: 'helpers', description: 'High-level helper commands for common Elasticsearch workflows' })
  applyHelpGroup(helpersGroup, 'Helpers')

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}
