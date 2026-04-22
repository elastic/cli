/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { EsApiDefinition } from './types.ts'
import { validateApiDefinition, resolveInput } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import { apiManifest, loadEsApi } from './apis.ts'
import type { EsApiMeta } from './api-manifest.ts'
import { createEsHandler } from './handler.ts'
import { registerHelperCommands } from './helpers/register.ts'

/** Builds a leaf command handle from an eagerly-available definition and its pre-computed schema args. */
function buildLeafHandle (
  def: EsApiDefinition,
  defSchemaArgs: Map<EsApiDefinition, SchemaArgDefinition[]>
): OpaqueCommandHandle {
  const schema = def.input != null ? resolveInput(def.input) : z.looseObject({})
  const schemaArgs = defSchemaArgs.get(def) ?? []
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    handler: createEsHandler(def, schemaArgs)
  })
}

/**
 * Builds a lightweight stub leaf command: just name + description, no options,
 * and an action that explains the stub should have been replaced by the lazy
 * loader. The stub is used for commands the user has NOT asked to invoke -
 * Commander still shows them in group-level help, but we never pay the cost
 * of loading their Zod schemas.
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
    const def = await loadEsApi(meta)
    const schemaArgs = validateApiDefinition(def)
    const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
    defSchemaArgs.set(def, schemaArgs)
    const real = buildLeafHandle(def, defSchemaArgs)
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
 * {@link registerEsCommandsLazy} to avoid loading 294 Zod schemas up-front.
 *
 * @throws {Error} if any definition fails validation or there are duplicate names at any level
 */
export function registerEsCommands (
  definitions: EsApiDefinition[]
): OpaqueCommandHandle {
  return buildEagerTree(definitions)
}

/**
 * Lazy production path: builds the `es` command tree from the static
 * `apiManifest` (cheap metadata only). Argv is sniffed to identify the invoked
 * leaf; only that leaf's endpoint file is dynamic-imported eagerly so Commander
 * can register its Zod-derived flags before parsing. Every other leaf stays as
 * a stub that lazy-loads on demand if the sniff missed.
 *
 * Keeps startup heap bounded - see #171.
 */
export async function registerEsCommandsLazy (
  opts: RegisterLazyOptions = {}
): Promise<OpaqueCommandHandle> {
  return await buildLazyTree(apiManifest, opts.argv ?? process.argv)
}

/** Eager-tree builder: behaviourally identical to the original pre-lazy implementation. */
function buildEagerTree (definitions: EsApiDefinition[]): OpaqueCommandHandle {
  const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
  for (const def of definitions) {
    defSchemaArgs.set(def, validateApiDefinition(def))
  }

  const byNamespace = new Map<string, EsApiDefinition[]>()
  const rootDefs: EsApiDefinition[] = []
  for (const def of definitions) {
    if (def.namespace !== undefined) {
      let group = byNamespace.get(def.namespace)
      if (group == null) {
        group = []
        byNamespace.set(def.namespace, group)
      }
      group.push(def)
    } else {
      rootDefs.push(def)
    }
  }

  const topLevelNames = new Set<string>()

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    if (topLevelNames.has(namespace)) {
      throw new Error(`duplicate command name "${namespace}" at the top level of es`)
    }
    topLevelNames.add(namespace)

    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) {
        throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      }
      seen.add(def.name)
    }

    const leafHandles = defs.map((def) => buildLeafHandle(def, defSchemaArgs))
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    )
  }

  const rootHandles: OpaqueCommandHandle[] = []
  for (const def of rootDefs) {
    if (topLevelNames.has(def.name)) {
      throw new Error(`duplicate command name "${def.name}" at the top level of es`)
    }
    topLevelNames.add(def.name)
    rootHandles.push(buildLeafHandle(def, defSchemaArgs))
  }

  const helpersGroup = registerHelperCommands()

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}

/**
 * Lazy-tree builder: registers stubs for every manifest entry and, if argv
 * identifies an invoked leaf, eagerly replaces that leaf's stub with its full
 * `defineCommand`. All other leaves remain stubs.
 */
async function buildLazyTree (manifest: readonly EsApiMeta[], argv: readonly string[]): Promise<OpaqueCommandHandle> {
  const invoked = sniffInvokedLeaf(argv, manifest)

  // Pre-load the invoked leaf's definition so Commander can register real flags
  // before parsing (so `--help` shows them and unknown flags error as usual).
  // This is the ONE synchronous schema load per invocation - every other leaf
  // stays a stub.
  let invokedDef: EsApiDefinition | null = null
  if (invoked != null) {
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
      let group = byNamespace.get(m.namespace)
      if (group == null) {
        group = []
        byNamespace.set(m.namespace, group)
      }
      group.push(m)
    } else {
      rootMetas.push(m)
    }
  }

  function leafHandleFor (m: EsApiMeta): OpaqueCommandHandle {
    if (invoked != null && invokedDef != null && m === invoked) {
      return buildLeafHandle(invokedDef, invokedSchemaArgs)
    }
    return buildStubLeaf(m)
  }

  const topLevelNames = new Set<string>()
  const namespaceHandles: OpaqueCommandHandle[] = []

  for (const [namespace, metas] of byNamespace) {
    if (topLevelNames.has(namespace)) {
      throw new Error(`duplicate command name "${namespace}" at the top level of es`)
    }
    topLevelNames.add(namespace)

    const seen = new Set<string>()
    for (const m of metas) {
      if (seen.has(m.name)) {
        throw new Error(`duplicate command name "${m.name}" in namespace "${namespace}"`)
      }
      seen.add(m.name)
    }

    const leafHandles = metas.map(leafHandleFor)
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    )
  }

  const rootHandles: OpaqueCommandHandle[] = []
  for (const m of rootMetas) {
    if (topLevelNames.has(m.name)) {
      throw new Error(`duplicate command name "${m.name}" at the top level of es`)
    }
    topLevelNames.add(m.name)
    rootHandles.push(leafHandleFor(m))
  }

  const helpersGroup = registerHelperCommands()

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles, helpersGroup)
}
