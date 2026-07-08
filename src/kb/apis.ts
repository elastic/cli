/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lazy barrel for Kibana API definitions.
 * Loads from @elastic/schemas/kibana/tools/apis/ subpath imports.
 */

import type { KbApiDefinition } from './types.ts'
import type { KbApiMeta } from './api-manifest.ts'
export { kbApiManifest } from './api-manifest.ts'
export type { KbApiMeta } from './api-manifest.ts'

/** Converts a kebab-case stem to camelCase export name, e.g. "data-views" → "dataViews" */
function toCamelCase (stem: string): string {
  return stem.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
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
    const exportKey = `${toCamelCase(namespaceFile)}Definitions`
    const arr = mod[exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${namespaceFile}.js did not export ${exportKey}`)
    }
    return arr as KbApiDefinition[]
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
