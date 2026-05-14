/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KbApiDefinition } from '../src/kb/types.ts'

const ROOT = path.join(fileURLToPath(import.meta.url), '..', '..')
const APIS_DIR = path.join(ROOT, 'src', 'kb', 'apis')
const OUT = path.join(ROOT, 'src', 'kb', 'api-manifest.ts')

/** Converts a kebab-case file stem to the camelCase export name used in namespace files. */
function toCamelCase (stem: string): string {
  return stem.replace(/-([a-z0-9])/g, (_, c: string) => (c as string).toUpperCase())
}

const files = fs.readdirSync(APIS_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'types.ts')
  .sort()

const allKbApis: KbApiDefinition[] = []

for (const file of files) {
  const stem = file.replace(/\.ts$/, '')
  const mod = await import(path.join(APIS_DIR, file)) as Record<string, unknown>
  const exportName = `${toCamelCase(stem)}Apis`
  const arr = mod[exportName]
  if (!Array.isArray(arr)) {
    throw new Error(`${file} did not export ${exportName}`)
  }
  allKbApis.push(...(arr as KbApiDefinition[]))
}

// Map each namespace to the file stem that defines it.
const nsToFile = new Map<string, string>()
for (const def of allKbApis) {
  if (nsToFile.has(def.namespace)) continue
  for (const file of files) {
    const content = fs.readFileSync(path.join(APIS_DIR, file), 'utf8')
    if (content.includes(`namespace: "${def.namespace}"`)) {
      nsToFile.set(def.namespace, file.replace('.ts', ''))
      break
    }
  }
}

const manifest = allKbApis.map(d => ({
  name: d.name,
  namespace: d.namespace,
  description: d.description,
  method: d.method,
  path: d.path,
  namespaceFile: nsToFile.get(d.namespace) ?? 'unknown',
}))

const lines = [
  '/*',
  ' * Copyright Elasticsearch B.V. and contributors',
  ' * SPDX-License-Identifier: Apache-2.0',
  ' */',
  '',
  '/*',
  ' * AUTO-GENERATED from src/kb/apis/*.ts.',
  ' * DO NOT EDIT BY HAND. Regenerate after running the code generator.',
  ' */',
  '',
  "import type { HttpMethod } from './types.ts'",
  '',
  '/** Cheap metadata for every Kibana API command. No Zod schemas built. */',
  'export interface KbApiMeta {',
  '  readonly name: string',
  '  readonly namespace: string',
  '  readonly description: string',
  '  readonly method: HttpMethod',
  '  readonly path: string',
  '  /** File stem under src/kb/apis/ that holds the full KbApiDefinition. */',
  '  readonly namespaceFile: string',
  '}',
  '',
  'export const kbApiManifest: readonly KbApiMeta[] = ' + JSON.stringify(manifest, null, 2),
  '',
]

fs.writeFileSync(OUT, lines.join('\n'))
console.log(`Wrote manifest with ${manifest.length} entries`)
