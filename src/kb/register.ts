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
import { formatTextResponse } from '../output.ts'
import type { AvailabilityTarget } from '../lib/availability.ts'
import { isAvailable, parseVersionHint } from '../lib/availability.ts'
import { getResolvedConfig } from '../config/store.ts'

// Every Kibana definition passes `validateKbApiDefinition` as of @elastic/schemas 0.5.1;
// the five upstream path-param defects that used to need an allowlist here are fixed.
// Registration is the single enforcement point: every handler is built through
// `buildLeafHandle` (including the lazy stub path, which loads its definition and then
// calls it), so an upstream regression fails here rather than at request time.

/** Builds a leaf command handle from a definition. */
function buildLeafHandle (def: KbApiDefinition, target?: AvailabilityTarget): OpaqueCommandHandle {
  validateKbApiDefinition(def)
  return defineCommand({
    name: def.name,
    description: def.description,
    ...(def.input !== undefined ? { input: def.input } : {}),
    readOnly: def.method === 'GET' || def.method === 'HEAD',
    handler: createKbHandler(def),
    ...(def.intent != null || inferIntentFromHttp(def.method) != null
      ? { intent: def.intent ?? inferIntentFromHttp(def.method)! }
      : {}),
    ...(def.responseType === 'text' ? { formatOutput: formatTextResponse } : {}),
    ...(target !== undefined ? { target } : {}),
  })
}

/**
 * Builds a stub leaf command that loads its full definition on demand.
 * Commander still shows the stub in group-level help.
 */
function buildStubLeaf (meta: KbApiMeta, target?: AvailabilityTarget): OpaqueCommandHandle {
  const cmd = new Command(meta.name)
  cmd.description(meta.description)
  cmd.allowUnknownOption(true)
  cmd.action(async () => {
    const def = await loadKbApi(meta)
    const real = buildLeafHandle(def, target)
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

/**
 * Sniffs `process.argv` to identify which KB leaf command the user
 * intends to invoke. Returns `null` on ambiguity or help requests.
 */
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
  /** Availability target; when present, commands and flags not matching the target are excluded. */
  target?: AvailabilityTarget
}

/**
 * Lazily registers all Kibana API commands. Only the invoked endpoint's
 * namespace file is loaded; everything else stays as lightweight stubs.
 *
 * When `opts.target` is absent, the target is resolved from the active context's
 * `kibana.version` in the resolved config store.
 */
export async function registerKbCommandsLazy (
  opts: RegisterLazyOptions = {}
): Promise<OpaqueCommandHandle> {
  const argv = opts.argv ?? process.argv
  let target = opts.target
  if (target === undefined) {
    const version = getResolvedConfig()?.context.kibana?.version
    if (version != null) target = parseVersionHint(version) ?? undefined
  }
  const manifest = kbApiManifest.filter(m =>
    isAvailable((m as unknown as Record<string, unknown>)['availability'], target)
  )
  const invoked = sniffInvokedLeaf(argv, manifest)

  let invokedDef: KbApiDefinition | null = null
  if (invoked != null) invokedDef = await loadKbApi(invoked)

  const byNamespace = new Map<string, KbApiMeta[]>()
  for (const m of manifest) {
    let group = byNamespace.get(m.namespace!)

    if (group == null) {
      group = []
      byNamespace.set(m.namespace!, group)
    }
    group.push(m)
  }

  function leafHandleFor (m: KbApiMeta): OpaqueCommandHandle {
    if (invoked != null && invokedDef != null && m === invoked) return buildLeafHandle(invokedDef, target)
    return buildStubLeaf(m, target)
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
 * Requires all definitions to be passed in.
 */
export function registerKbCommands (definitions: KbApiDefinition[]): OpaqueCommandHandle {
  for (const def of definitions) validateKbApiDefinition(def)

  const byNamespace = new Map<string, KbApiDefinition[]>()
  for (const def of definitions) {
    let group = byNamespace.get(def.namespace)
    if (group == null) {
      group = []
      byNamespace.set(def.namespace, group)
    }
    group.push(def)
  }

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      seen.add(def.name)
    }
    const leafHandles = defs.map(def => buildLeafHandle(def))
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Kibana ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'kb', description: 'Interact with the Kibana API' }, ...namespaceHandles)
}
