/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Regenerates codegen/functional/stack-since.json. Run from the repo root:
//   npx tsx .agents/skills/stack-since/scripts/update-stack-since.ts [es-schema] [kibana-oas]
// Each argument is a URL or local path; defaults fetch from GitHub `main`.

import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'yaml'
import { loadAllKbApis } from '../../../../src/kb/apis.ts'

const ES_SCHEMA = process.argv[2] ?? 'https://raw.githubusercontent.com/elastic/elasticsearch-specification/main/output/schema/schema.json'
const KIBANA_OAS = process.argv[3] ?? 'https://raw.githubusercontent.com/elastic/kibana/main/oas_docs/output/kibana.yaml'
const OUT = 'codegen/functional/stack-since.json'

async function load (src: string): Promise<string> {
  if (!/^https?:\/\//.test(src)) return readFileSync(src, 'utf8')
  const res = await fetch(src, { redirect: 'error' })
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`)
  return await res.text()
}

// APIs from before the oldest tested stack (9.0) never need a gate.
const isGated = (v: string): boolean => Number(v.split('.')[0]) >= 9
const sorted = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))

const es: Record<string, string> = {}
for (const e of JSON.parse(await load(ES_SCHEMA)).endpoints) {
  const since = e.availability?.stack?.since
  if (since != null && isGated(since)) es[e.name] = since
}

// Keys match the action names definitions use: CLI namespace, name with `_`.
const actions = new Map((await loadAllKbApis()).map((a) =>
  [`${a.method.toUpperCase()} ${a.path}`, `${a.namespace}.${a.name.replace(/-/g, '_')}`]))
const kb: Record<string, string> = {}
const missing: string[] = []
for (const [path, ops] of Object.entries<Record<string, { 'x-state'?: unknown } | undefined>>(parse(await load(KIBANA_OAS)).paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const since = /added in (\d+\.\d+\.\d+)/i.exec(String(op?.['x-state'] ?? ''))?.[1]
    if (since == null || !isGated(since)) continue
    const key = `${method.toUpperCase()} ${path}`
    const action = actions.get(key)
    if (action == null) missing.push(key)
    else kb[action] = since
  }
}

writeFileSync(OUT, JSON.stringify({ es: sorted(es), kb: sorted(kb) }, null, 2) + '\n')
console.log(`${OUT}: es=${Object.keys(es).length} kb=${Object.keys(kb).length}`)
if (missing.length > 0) console.log(`Kibana operations with no CLI command (skipped):\n  ${missing.sort().join('\n  ')}`)
