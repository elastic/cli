/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates client-agnostic YAML functional-test definitions for every Cloud
 * control plane API, using `@elastic/schemas` as the source of truth.
 *
 * Scope is read-only: only GET endpoints are emitted, so the suite never
 * mutates real Cloud state. Two shapes are produced:
 *
 *   - Collection GETs (no required path params, no other required params) emit
 *     a single `do` — the command exiting 0 with a valid response is the check.
 *   - Item GETs (exactly one required path param, no other required params)
 *     that have a sibling collection GET in the same namespace derive the id
 *     from a preceding list call via `set`, then call the item endpoint.
 *
 * Everything else (mutations, multi-path-param items, endpoints with required
 * query/body params, item GETs with no same-namespace collection) is skipped.
 *
 * Output files are written to `test/functional/cloud/definitions/` in the same
 * format as `test/functional/kb/definitions/` (see
 * elastic/elasticsearch-clients-tests for the format spec). They are committed
 * and re-generated only when the upstream schemas change. The `.sh` scripts are
 * generated from these YAML files by `cloud.ts`.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { loadCloudApis } from '../../src/cloud/apis.ts'
import { loadServerlessApis } from '../../src/cloud/serverless-apis.ts'
import { resolveRootRef } from '../../src/lib/json-schema-refs.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

const DEFS_DIR = 'test/functional/cloud/definitions'

interface GetShape {
  def: CloudApiDefinition
  pathParams: string[]
  /** required params that are not path params (query/body) */
  requiredNonPath: string[]
}

function classify (def: CloudApiDefinition): GetShape {
  const input = def.input != null ? resolveRootRef(def.input) : undefined
  const props = (input?.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = (input?.required ?? []) as string[]
  const pathParams = Object.entries(props)
    .filter(([, v]) => v['x-found-in'] === 'path')
    .map(([k]) => k)
  const pathSet = new Set(pathParams)
  const requiredNonPath = required.filter((r) => !pathSet.has(r))
  return { def, pathParams, requiredNonPath }
}

function isCollection (s: GetShape): boolean {
  return s.pathParams.length === 0 && s.requiredNonPath.length === 0
}

function fileStem (def: CloudApiDefinition): string {
  return `${def.namespace}_${def.name}`.replace(/-/g, '_')
}

/** YAML-quotes a string value for a scalar. */
function q (s: string): string {
  return JSON.stringify(s)
}

function collectionYaml (def: CloudApiDefinition): string {
  return [
    '# Copyright Elasticsearch B.V. and contributors',
    '# SPDX-License-Identifier: Apache-2.0',
    `# Cloud control plane API: ${def.description} (${def.method} ${def.path})`,
    '---',
    `${q(`${def.namespace} ${def.name}`)}:`,
    '  - do:',
    `      ${def.namespace}.${def.name}: {}`,
    '',
  ].join('\n')
}

function itemYaml (item: GetShape, collection: CloudApiDefinition): string {
  const def = item.def
  const pathParam = item.pathParams[0]!
  // Collection list responses commonly wrap items under a key matching the
  // last hyphen-segment of the list command (list-deployments -> deployments).
  // The exact response path is best-effort and may need correction once run.
  const arrayKey = collection.name.split('-').pop()!
  return [
    '# Copyright Elasticsearch B.V. and contributors',
    '# SPDX-License-Identifier: Apache-2.0',
    `# Cloud control plane API: ${def.description} (${def.method} ${def.path})`,
    `# Id for {${pathParam}} is derived from ${collection.namespace}.${collection.name}.`,
    '# TODO: verify the response path in the `set` step against a live API.',
    '---',
    `${q(`${def.namespace} ${def.name}`)}:`,
    '  - do:',
    `      ${collection.namespace}.${collection.name}: {}`,
    `  - set: { ${arrayKey}.0.id: ${pathParam} }`,
    '  - do:',
    `      ${def.namespace}.${def.name}:`,
    `        ${pathParam}: $${pathParam}`,
    '',
  ].join('\n')
}

const all = [...(await loadCloudApis()), ...(await loadServerlessApis())]
const gets = all.filter((d) => d.method === 'GET').map(classify)

// Collections grouped by namespace, for sibling id-derivation.
const collectionsByNs = new Map<string, CloudApiDefinition[]>()
for (const s of gets) {
  if (!isCollection(s)) continue
  const list = collectionsByNs.get(s.def.namespace) ?? []
  list.push(s.def)
  collectionsByNs.set(s.def.namespace, list)
}

const stripVerb = (n: string): string => n.replace(/^(list|get)-/, '')
const singularize = (n: string): string => (n.endsWith('s') ? n.slice(0, -1) : n)

/**
 * Picks the sibling collection whose items carry the id the item GET needs.
 * A named path param (e.g. `deployment_id`) is matched by its resource
 * (`deployment` -> a collection ending in `deployment`); a generic `id` param
 * is matched by the item's own resource name (`get-security-project` pairs with
 * `list-security-projects`).
 */
function pickCollection (item: GetShape, collections: CloudApiDefinition[]): CloudApiDefinition | null {
  const param = item.pathParams[0]!
  let matches: (c: CloudApiDefinition) => boolean
  if (param !== 'id') {
    const resource = param.replace(/_id$/, '').replace(/_/g, '-')
    matches = (c) => singularize(stripVerb(c.name)).endsWith(resource)
  } else {
    const resource = stripVerb(item.def.name)
    // Sub-resource GETs (get-security-project-status) share the collection's
    // resource as a prefix, so a prefix match keeps them paired with the list.
    matches = (c) => resource.startsWith(singularize(stripVerb(c.name)))
  }
  return collections.find((c) => c.name !== item.def.name && matches(c)) ?? null
}

rmSync(DEFS_DIR, { recursive: true, force: true })
mkdirSync(DEFS_DIR, { recursive: true })

let emitted = 0
const skipped: string[] = []

for (const s of gets) {
  const { def } = s
  let yaml: string | null = null

  if (isCollection(s)) {
    yaml = collectionYaml(def)
  } else if (s.pathParams.length === 1 && s.requiredNonPath.length === 0) {
    const collection = pickCollection(s, collectionsByNs.get(def.namespace) ?? [])
    if (collection != null) {
      yaml = itemYaml(s, collection)
    }
  }

  if (yaml == null) {
    skipped.push(`${def.namespace}.${def.name}`)
    continue
  }

  writeFileSync(join(DEFS_DIR, `${fileStem(def)}.yml`), yaml)
  emitted++
}

console.log(`Generated ${emitted} Cloud test definitions → ${DEFS_DIR}/`)
if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} GET endpoints (mutating/unsupported params/no sibling list):`)
  for (const a of skipped.sort()) console.log(`  - ${a}`)
}
