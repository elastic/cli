/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Lazy barrel for Elasticsearch API definitions.
 *
 * Definitions are loaded on-demand from `@elastic/schemas/es/tools/apis/*` subpath
 * imports, each of which exports JSON Schema-based API registry definitions for one
 * namespace.
 *
 * Importing this file is cheap: only the manifest (metadata-only) is loaded eagerly.
 * The per-namespace definition files are NOT pulled in transitively - each resolves
 * a large `$ref` closure of shared type definitions, and loading all of them at once
 * allocates several gigabytes of heap.
 *
 * Callers that need the full `EsApiDefinition` (with its resolved `input` schema) for
 * a single endpoint must go through `loadEsApi()` or `loadEsApisInFile()`, which
 * dynamic-import exactly one namespace file.
 *
 * See elastic/cli#171 for the memory context.
 */

import type { EsApiDefinition } from './types.ts'
import { createDefinitionResolver, requireSchemaModule } from '../lib/json-schema-refs.ts'
import type { EsApiMeta } from './api-manifest.ts'
export { apiManifest } from './api-manifest.ts'
export type { EsApiMeta } from './api-manifest.ts'

/** Memoised module cache so repeated calls don't re-import the same namespace file. */
const moduleCache = new Map<string, Promise<EsApiDefinition[]>>()

/**
 * Rewrites each definition's `input` into a self-contained schema, inlining
 * the shared type definitions its `$ref`s point at. Sidecar files are loaded
 * once and shared across every definition that references them (some, like
 * `_types.json`, are referenced by hundreds).
 */
const resolveDefinition = createDefinitionResolver<EsApiDefinition>('@elastic/schemas/es/json')

/**
 * Dynamic-imports the namespace file identified by `namespaceFile` and returns
 * all `EsApiDefinition`s it exports. Subsequent calls for the same file return
 * the cached promise.
 *
 * Triggers `$ref` resolution for every definition in the file, which loads that
 * file's shared type-definition sidecars.
 */
export async function loadEsApisInFile (namespaceFile: string): Promise<EsApiDefinition[]> {
  let cached = moduleCache.get(namespaceFile)
  if (cached != null) return cached
  cached = (async (): Promise<EsApiDefinition[]> => {
    // File names use the dotted manifest name (e.g. 'cluster.stats.js'); export keys use underscores.
    // Use require (via requireSchemaModule) so this resolves under bundlers/pkg, not just tsx/native Node.
    const exportKey = `${namespaceFile.replace(/\./g, '_')}_definitions`
    const mod = requireSchemaModule(`@elastic/schemas/es/tools/apis/${namespaceFile}.js`)
    const arr = mod[exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${namespaceFile}.js did not export ${exportKey}`)
    }
    return Promise.all((arr as EsApiDefinition[]).map(resolveDefinition))
  })()
  moduleCache.set(namespaceFile, cached)
  return cached
}

/** Locates a single `EsApiDefinition` by its manifest entry. */
export async function loadEsApi (meta: EsApiMeta): Promise<EsApiDefinition> {
  const defs = await loadEsApisInFile(meta.namespaceFile)
  const found = defs.find(
    (d) => d.name === meta.name && (d.namespace ?? null) === meta.namespace
  )
  if (found == null) {
    const label = meta.namespace != null ? `${meta.namespace} ${meta.name}` : meta.name
    throw new Error(`internal error: manifest entry "${label}" has no match in ${meta.namespaceFile}.js`)
  }
  return found
}

/**
 * Eagerly loads every API definition, triggering every namespace module. ONLY use
 * this from tests or scripts that really need the full set - the typical CLI startup
 * path stays on the manifest + `loadEsApi()`.
 *
 * Files are loaded sequentially rather than with Promise.all to keep peak heap
 * manageable. Each namespace file resolves a multi-MB closure of shared type
 * definitions; loading all of them simultaneously can exhaust the V8 heap before GC
 * has a chance to reclaim allocations from earlier modules. See elastic/cli#171.
 */
export async function loadAllEsApis (): Promise<EsApiDefinition[]> {
  const { apiManifest } = await import('./api-manifest.ts')
  const files = [...new Set(apiManifest.map((m) => m.namespaceFile))]
  const results: EsApiDefinition[][] = []
  for (const file of files) {
    results.push(await loadEsApisInFile(file))
  }
  return results.flat()
}
