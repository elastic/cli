/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand, defineGroup } from '../factory.ts'
import type { CommandConfig, JsonValue, OpaqueCommandHandle } from '../factory.ts'
import { inferIntentFromHttp } from '@cli-schema/spec'
import type { KbApiDefinition } from './types.ts'
import { validateKbApiDefinition } from './types.ts'
import { kbApiManifest, loadKbApi } from './apis.ts'
import type { KbApiMeta } from './apis.ts'
import { createKbHandler } from './handler.ts'
import type { KbHandlerDeps } from './handler.ts'
import { formatTextResponse } from '../output.ts'
import type { AvailabilityTarget } from '../lib/availability.ts'
import { isAvailable, parseVersionHint } from '../lib/availability.ts'
import { getResolvedConfig } from '../config/store.ts'
import { buildStubLeaf } from '../lib/lazy-leaf.ts'
import { ACCEPT_EXPERIMENTAL_OPTION, warnIfExperimental } from '../lib/experimental.ts'
import type { ExperimentalNotice } from '../lib/experimental.ts'

// Every Kibana definition passes `validateKbApiDefinition` as of @elastic/schemas 0.5.1;
// the five upstream path-param defects that used to need an allowlist here are fixed.
// Registration is the single enforcement point: every handler is built through
// `buildLeafHandle` (including the lazy stub path, which loads its definition and then
// calls it), so an upstream regression fails here rather than at request time.

/** Builds a leaf command handle from a definition. */
function buildLeafHandle (
  def: KbApiDefinition,
  target?: AvailabilityTarget,
  overrides: Pick<CommandConfig, 'positionalArg' | 'options'> & { handler?: CommandConfig['handler'] } = {}
): OpaqueCommandHandle {
  validateKbApiDefinition(def)
  const intent = def.intent ?? inferIntentFromHttp(def.method)
  return defineCommand({
    name: def.name,
    description: def.description,
    ...(def.input !== undefined ? { input: def.input } : {}),
    readOnly: def.method === 'GET' || def.method === 'HEAD',
    handler: overrides.handler ?? createKbHandler(def),
    ...(overrides.positionalArg !== undefined ? { positionalArg: overrides.positionalArg } : {}),
    ...(overrides.options !== undefined ? { options: overrides.options } : {}),
    ...(intent != null ? { intent } : {}),
    ...(def.responseType === 'text' ? { formatOutput: formatTextResponse } : {}),
    ...(target !== undefined ? { target } : {}),
  })
}

/** A generated Kibana command re-exposed under another name with some input fields pinned. */
export interface KbPresetOptions {
  /** Manifest id of the generated command, e.g. `agent-builder.post-chat-message`. */
  apiId: string
  name: string
  description: string
  /** Input fields sent with a fixed value; they are removed from the command's flags and schema. */
  fixed: Record<string, JsonValue>
  /** Input field that may also be passed as the command's positional argument. */
  positional?: string
  /** Availability target; when set, no command is built if the endpoint is unavailable for it. */
  target?: AvailabilityTarget
  /** Narrows the endpoint's availability to these deployment flavors. */
  flavors?: ReadonlyArray<'stack' | 'serverless'>
  /**
   * Marks the command experimental: it warns on stderr before sending the request unless
   * `--accept-experimental` or `--json` is passed.
   */
  experimental?: ExperimentalNotice
}

/**
 * Builds a command from a generated Kibana API definition with some input fields
 * pinned, so a purpose-built command (e.g. `nightshift ask`) needs no hand-written
 * schema, request builder, or handler.
 *
 * @param deps - test seam forwarded to `createKbHandler`; production callers omit it
 * @returns the command, or `null` when the endpoint is unavailable for `opts.target`
 * @throws {Error} if `apiId` is not in the manifest, a fixed or positional field is not in its
 *   input schema, or a flavor is not in its availability
 */
export async function buildKbPresetCommand (opts: KbPresetOptions, deps?: KbHandlerDeps): Promise<OpaqueCommandHandle | null> {
  const meta = kbApiManifest.find(m => m.id === opts.apiId)
  if (meta == null) throw new Error(`unknown Kibana API ${JSON.stringify(opts.apiId)}`)
  let availability = (meta as unknown as Record<string, unknown>)['availability'] as Record<string, unknown> | undefined
  if (opts.flavors != null) {
    for (const flavor of opts.flavors) {
      if (availability == null || !(flavor in availability)) {
        throw new Error(`flavor ${JSON.stringify(flavor)} is not in the availability of ${opts.apiId}`)
      }
    }
    availability = Object.fromEntries(opts.flavors.map(flavor => [flavor, availability![flavor]]))
  }
  if (!isAvailable(availability, opts.target)) return null
  const def = await loadKbApi(meta)
  const properties = { ...(def.input?.['properties'] as Record<string, unknown> | undefined) }
  for (const key of Object.keys(opts.fixed)) {
    if (!(key in properties)) throw new Error(`fixed field ${JSON.stringify(key)} is not an input of ${opts.apiId}`)
    delete properties[key]
  }
  const positional = opts.positional
  if (positional != null && !(positional in properties)) {
    throw new Error(`positional field ${JSON.stringify(positional)} is not an input of ${opts.apiId}`)
  }
  const required = Array.isArray(def.input?.['required'])
    ? (def.input['required'] as string[]).filter(key => !(key in opts.fixed))
    : []
  const handler = createKbHandler(def, deps)
  const experimental = opts.experimental
  return buildLeafHandle(
    {
      ...def,
      name: opts.name,
      description: opts.description,
      // Generated schemas allow unknown keys; a pinned field supplied via JSON must error, not be overridden.
      input: { ...def.input, properties, required, additionalProperties: false },
    },
    opts.target,
    {
      handler: async (parsed) => {
        if (experimental != null) warnIfExperimental(parsed, experimental)
        return await handler({ ...parsed, input: { ...(parsed.input as Record<string, unknown> | undefined), ...opts.fixed } })
      },
      ...(experimental != null ? { options: [ACCEPT_EXPERIMENTAL_OPTION] } : {}),
      ...(positional != null
        ? {
            positionalArg: {
              name: positional,
              description: String((properties[positional] as Record<string, unknown>)['description'] ?? positional),
              required: false,
              inputKey: positional,
            },
          }
        : {}),
    }
  )
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

/** Resolves the availability target from the active context's `kibana.version` hint, if any. */
export function resolveKbTarget (): AvailabilityTarget | undefined {
  const version = getResolvedConfig()?.context.kibana?.version
  return version != null ? parseVersionHint(version) ?? undefined : undefined
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
  const target = opts.target ?? resolveKbTarget()
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
    return buildStubLeaf(m, async () => buildLeafHandle(await loadKbApi(m), target))
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
