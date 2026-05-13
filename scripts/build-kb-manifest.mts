import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import type { KbApiDefinition } from '../src/kb/types.ts'

const apisDir = path.resolve('./src/kb/apis')
const files = fs.readdirSync(apisDir).filter(f => f.endsWith('.ts')).sort()

function toCamelCase (stem: string): string {
  return stem.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

interface Entry {
  def: KbApiDefinition
  file: string
}

const entries: Entry[] = []
for (const file of files) {
  const stem = file.replace(/\.ts$/, '')
  const exportName = `${toCamelCase(stem)}Apis`
  const mod = await import(pathToFileURL(path.join(apisDir, file)).href) as Record<string, KbApiDefinition[]>
  const defs = mod[exportName]
  if (!Array.isArray(defs)) {
    throw new Error(`src/kb/apis/${file} did not export ${exportName}`)
  }
  for (const def of defs) {
    entries.push({ def, file: stem })
  }
}

const manifest = entries.map(({ def, file }) => ({
  name: def.name,
  namespace: def.namespace,
  description: def.description,
  method: def.method,
  path: def.path,
  namespaceFile: file,
}))

const lines = [
  '/*',
  ' * Copyright Elasticsearch B.V. and contributors',
  ' * SPDX-License-Identifier: Apache-2.0',
  ' */',
  '',
  '/*',
  ' * AUTO-GENERATED from src/kb/apis/*.ts via scripts/build-kb-manifest.mts.',
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

fs.writeFileSync('./src/kb/api-manifest.ts', lines.join('\n'))
console.log(`Wrote manifest with ${manifest.length} entries`)
