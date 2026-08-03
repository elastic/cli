/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { inferIntentFromHttp } from '@cli-schema/spec'
import type { KbApiDefinition } from './types.ts'
import { validateKbApiDefinition } from './types.ts'
import { kbApiManifest, loadKbApi } from './apis.ts'
import type { KbApiMeta } from './apis.ts'
import { createKbHandler } from './handler.ts'

/**
 * Kibana API definitions that fail `validateKbApiDefinition`'s path-param check because of
 * an upstream `@elastic/schemas` defect (a path placeholder not declared with
 * `x-found-in: "path"` in the input schema). These are known and tracked upstream; the CLI
 * still registers them so the rest of the namespace is usable, but `createKbHandler` refuses
 * to invoke them (see handler.ts) rather than silently sending a request to a literal
 * `{id}`/`{name}` URL.
 */
export const KNOWN_UPSTREAM_PATH_PARAM_MISMATCHES = new Set<string>([
  'security-ai-assistant-api update-conversation',
  'security-entity-analytics-api update-priv-mon-user',
  'security-osquery-api osquery-update-saved-query',
  'spaces put-spaces-space-id',
  'streams post-streams-name-content-export',
])

/**
 * Validates a definition, allowing the known upstream path-param mismatches through
 * registration (they still fail loudly at invocation time, see `createKbHandler`).
 * Anything else that fails validation is a registration-time bug and must throw.
 */
function assertRegistrableKbApiDefinition (def: KbApiDefinition): void {
  try {
    validateKbApiDefinition(def)
  } catch (err) {
    if (KNOWN_UPSTREAM_PATH_PARAM_MISMATCHES.has(`${def.namespace} ${def.name}`)) return
    throw err
  }
}

/** Builds a leaf command handle from a definition. */
function buildLeafHandle (def: KbApiDefinition): OpaqueCommandHandle {
  assertRegistrableKbApiDefinition(def)
  return defineCommand({
    name: def.name,
    description: def.description,
    ...(def.input !== undefined ? { input: def.input } : {}),
    readOnly: def.method === 'GET' || def.method === 'HEAD',
    handler: createKbHandler(def),
    ...(def.intent != null || inferIntentFromHttp(def.method) != null
      ? { intent: def.intent ?? inferIntentFromHttp(def.method)! }
      : {}),
    ...(def.responseType === 'text' ? { formatOutput: (result) => String(result) } : {}),
  })
}

/** Builds a stub leaf that loads its full definition on demand. */
function buildStubLeaf (meta: KbApiMeta): OpaqueCommandHandle {
  const cmd = new Command(meta.name)
  cmd.description(meta.description)
  cmd.allowUnknownOption(true)
  cmd.action(async () => {
    const def = await loadKbApi(meta)
    const real = buildLeafHandle(def)
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

function sniffInvokedLeaf (argv: readonly string[], manifest: readonly KbApiMeta[]): KbApiMeta | null {
  const kbIdx = argv.findIndex((a, i) => i >= 2 && (a === 'kb' || a === 'kibana'))
  if (kbIdx < 0) return null
  const afterKb = argv.slice(kbIdx + 1).filter(a => !a.startsWith('-'))
  if (afterKb.length === 0) return null
  const namespaces = new Set(manifest.map(m => m.namespace))
  if (afterKb.length >= 2 && namespaces.has(afterKb[0]!)) {
    return manifest.find(m => m.namespace === afterKb[0]! && m.name === afterKb[1]!) ?? null
  }
  if (afterKb.length >= 1 && !namespaces.has(afterKb[0]!)) {
    return manifest.find(m => m.name === afterKb[0]!) ?? null
  }
  return null
}

export interface RegisterLazyOptions {
  argv?: readonly string[]
}

/**
 * Lazily registers all Kibana API commands.
 */
export async function registerKbCommandsLazy (
  opts: RegisterLazyOptions = {}
): Promise<OpaqueCommandHandle> {
  const argv = opts.argv ?? process.argv
  const invoked = sniffInvokedLeaf(argv, kbApiManifest)

  let invokedDef: KbApiDefinition | null = null
  if (invoked != null) invokedDef = await loadKbApi(invoked)

  const byNamespace = new Map<string, KbApiMeta[]>()
  for (const m of kbApiManifest) {
    let grp = byNamespace.get(m.namespace!)
    if (grp == null) { grp = []; byNamespace.set(m.namespace!, grp) }
    grp.push(m)
  }

  function leafHandleFor (m: KbApiMeta): OpaqueCommandHandle {
    if (invoked != null && invokedDef != null && m === invoked) return buildLeafHandle(invokedDef)
    return buildStubLeaf(m)
  }

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, metas] of byNamespace) {
    const leafHandles = metas.map(leafHandleFor)
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Kibana ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'kb', description: 'Interact with the Kibana API' }, ...namespaceHandles)
}

/**
 * Eagerly registers all Kibana API commands (for tests and scripts).
 */
export function registerKbCommands (definitions: KbApiDefinition[]): OpaqueCommandHandle {
  for (const def of definitions) assertRegistrableKbApiDefinition(def)

  const byNamespace = new Map<string, KbApiDefinition[]>()
  for (const def of definitions) {
    let grp = byNamespace.get(def.namespace)
    if (grp == null) { grp = []; byNamespace.set(def.namespace, grp) }
    grp.push(def)
  }

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      seen.add(def.name)
    }
    const leafHandles = defs.map(buildLeafHandle)
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Kibana ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'kb', description: 'Interact with the Kibana API' }, ...namespaceHandles)
}
