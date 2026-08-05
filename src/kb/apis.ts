/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lazy barrel for Kibana API definitions.
 * Loads from @elastic/schemas/kibana/tools/apis/ subpath imports.
 */

import type { KbApiDefinition } from './types.ts'
import { createDefinitionResolver } from '../lib/json-schema-refs.ts'
import { toExportStem } from '../lib/namespace-file-export.ts'
import type { KbApiMeta } from './api-manifest.ts'
export { kbApiManifest } from './api-manifest.ts'
export type { KbApiMeta } from './api-manifest.ts'

/**
 * Rewrites each definition's `input` into a self-contained schema, inlining the
 * shared definitions its nested `$ref`s point at (`_defs.json`). `flattenComposition`
 * only resolves root-level and composition-entry refs; refs nested inside properties
 * would otherwise reach AJV unresolved.
 */
const resolveDefinition = createDefinitionResolver<KbApiDefinition>('@elastic/schemas/kibana/json')

/**
 * @elastic/schemas expresses Kibana request bodies that combine multiple valid
 * shapes (e.g. per-rule-type union bodies) as top-level `properties` for path/query
 * params plus `allOf` entries holding the actual body schema. Merge inline-object
 * `allOf` entries into the top level so those body fields surface as CLI flags.
 * Root-level `$ref`s and `oneOf`/`allOf` entries that `$ref` into `_defs.json` are resolved
 * against that file; other `$ref` targets are left alone.
 *
 * `allOf` is valid JSON Schema composition -- @elastic/schemas isn't wrong to emit it,
 * and there's nothing to fix upstream. This is CLI-side because the CLI never runs a
 * full JSON Schema evaluator over `input`; it reads `properties`/`required` directly
 * to derive CLI flags (json-schema-args.ts) and body routing (request-builder.ts).
 */
async function flattenComposition (input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = { ...input }
  const rootRef = result['$ref']
  if (typeof rootRef === 'string') {
    const resolved = await resolveDefRef(rootRef)
    if (resolved != null) {
      delete result['$ref']
      Object.assign(result, resolved)
    }
  }
  // oneOf branches are alternatives, but the CLI only needs the union of possible flags.
  const entries = [...asArray(result['allOf']), ...asArray(result['oneOf'])]
  if (entries.length === 0) return result
  const properties = { ...(result['properties'] as Record<string, unknown> | undefined) }
  const required = new Set(Array.isArray(result['required']) ? result['required'] as string[] : [])
  const merged = result['oneOf'] == null
  for (const raw of entries) {
    if (raw == null || typeof raw !== 'object') continue
    let entry = raw as Record<string, unknown>
    const ref = entry['$ref']
    if (typeof ref === 'string') entry = (await resolveDefRef(ref)) ?? entry
    const entryProps = entry['properties']
    if (entryProps == null || typeof entryProps !== 'object') continue
    Object.assign(properties, entryProps)
    // Only `allOf` requirements are unconditional; a `oneOf` branch's are not.
    const entryRequired = entry['required']
    if (merged && Array.isArray(entryRequired)) for (const key of entryRequired) required.add(key as string)
  }
  delete result['allOf']
  delete result['oneOf']
  result['type'] = 'object'
  result['properties'] = properties
  result['required'] = [...required]
  return result
}

function asArray (value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * @elastic/schemas models 78 Kibana request bodies as a single property (usually `body`)
 * marked `x-body-root` whose value -- an object `$ref` into `_defs.json` -- becomes the whole
 * request body. `flattenComposition` handles the `allOf`/`oneOf` body shape; this handles the
 * `x-body-root` object shape so those body fields surface as individual CLI flags instead of a
 * single opaque `--body <json>` blob (AGENTS.md: every input field needs a flag).
 *
 * Promotion is skipped when a body sub-field's key collides with an existing top-level property
 * (e.g. a `body.id` alongside a path `id`): those endpoints keep the `--body` blob so no field is
 * silently dropped. Non-object body-roots (scalars, `oneOf` unions) are also left as `--body`.
 */
async function promoteBodyRootObject (input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const properties = input['properties'] as Record<string, Record<string, unknown>> | undefined
  if (properties == null) return input
  let nextProps = { ...properties }
  let required = new Set(Array.isArray(input['required']) ? input['required'] as string[] : [])
  let changed = false
  for (const [key, prop] of Object.entries(properties)) {
    if (prop['x-body-root'] !== true) continue
    let target = prop
    const ref = prop['$ref']
    if (typeof ref === 'string') {
      const resolved = await resolveDefRef(ref)
      if (resolved != null) target = resolved
    }
    if (target['type'] !== 'object') continue
    const subProps = target['properties']
    if (subProps == null || typeof subProps !== 'object') continue
    const subEntries = Object.entries(subProps as Record<string, Record<string, unknown>>)
    // Bail on any collision with a sibling top-level key: dropping a field would lose input.
    const siblings = new Set(Object.keys(nextProps).filter((k) => k !== key))
    if (subEntries.some(([subKey]) => siblings.has(subKey))) continue
    nextProps = { ...nextProps }
    delete nextProps[key]
    required = new Set(required)
    required.delete(key)
    for (const [subKey, subSchema] of subEntries) {
      nextProps[subKey] = { ...subSchema, 'x-found-in': 'body' }
    }
    if (Array.isArray(target['required'])) for (const r of target['required'] as string[]) required.add(r)
    changed = true
  }
  if (!changed) return input
  return { ...input, properties: nextProps, required: [...required] }
}

let defsPromise: Promise<Record<string, Record<string, unknown>>> | undefined

/** Resolves a `./_defs.json#/$defs/Name` pointer, or returns undefined for any other ref form. */
async function resolveDefRef (ref: string): Promise<Record<string, unknown> | undefined> {
  const name = /^\.\/_defs\.json#\/\$defs\/(.+)$/.exec(ref)?.[1]
  if (name == null) return undefined
  defsPromise ??= (async () => {
    const url = import.meta.resolve('@elastic/schemas/kibana/json/_defs.json')
    const mod = await import(url, { with: { type: 'json' } }) as { default: { $defs: Record<string, Record<string, unknown>> } }
    return mod.default.$defs
  })()
  return (await defsPromise)[name]
}

const moduleCache = new Map<string, Promise<KbApiDefinition[]>>()

/**
 * Dynamic-imports the namespace file from @elastic/schemas.
 */
export async function loadKbApisInFile (namespaceFile: string): Promise<KbApiDefinition[]> {
  let cached = moduleCache.get(namespaceFile)
  if (cached != null) return cached
  cached = (async (): Promise<KbApiDefinition[]> => {
    // Use import.meta.resolve to get a file URL so dynamic import works under tsx and native Node alike.
    const fileUrl = import.meta.resolve(`@elastic/schemas/kibana/tools/apis/${namespaceFile}.js`)
    const mod = await import(fileUrl) as Record<string, unknown>
    const exportKey = `${toExportStem(namespaceFile)}Definitions`
    const arr = mod[exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${namespaceFile}.js did not export ${exportKey}`)
    }
    const defs = arr as KbApiDefinition[]
    const resolved: KbApiDefinition[] = []
    for (const def of defs) {
      if (def.input != null) {
        def.input = await promoteBodyRootObject(await flattenComposition(def.input))
      }
      resolved.push(await resolveDefinition(def))
    }
    return resolved
  })()
  moduleCache.set(namespaceFile, cached)
  return cached
}

/** Locates a single `KbApiDefinition` by its manifest entry. */
export async function loadKbApi (meta: KbApiMeta): Promise<KbApiDefinition> {
  const defs = await loadKbApisInFile(meta.namespaceFile)
  const found = defs.find(
    (d) => d.name === meta.name && d.namespace === meta.namespace
  )
  if (found == null) {
    throw new Error(`internal error: manifest entry "${meta.namespace} ${meta.name}" has no match in ${meta.namespaceFile}.js`)
  }
  return found
}

/** Loads all KB API definitions eagerly (for tests and scripts). */
export async function loadAllKbApis (): Promise<KbApiDefinition[]> {
  const { kbApiManifest } = await import('./api-manifest.ts')
  const files = [...new Set(kbApiManifest.map((m) => m.namespaceFile))]
  const results: KbApiDefinition[][] = []
  for (const file of files) {
    results.push(await loadKbApisInFile(file))
  }
  return results.flat()
}
