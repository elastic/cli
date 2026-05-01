import { allKbApis } from '../src/kb/apis.ts'
import * as fs from 'fs'
import * as path from 'path'

const apisDir = './src/kb/apis'
const files = fs.readdirSync(apisDir).filter(f => f.endsWith('.ts'))

const nsToFile = new Map<string, string>()
for (const def of allKbApis) {
  if (!nsToFile.has(def.namespace)) {
    for (const file of files) {
      const content = fs.readFileSync(path.join(apisDir, file), 'utf8')
      if (content.includes(`namespace: "${def.namespace}"`)) {
        nsToFile.set(def.namespace, file.replace('.ts', ''))
        break
      }
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

fs.writeFileSync('./src/kb/api-manifest.ts', lines.join('\n'))
console.log(`Wrote manifest with ${manifest.length} entries`)
