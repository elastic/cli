#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const APIS_DIR = join(ROOT, 'src', 'es', 'apis')
const OUT = join(ROOT, 'src', 'es', 'api-manifest.ts')

const DEF_RE = /^\s*\{\s*$([\s\S]*?)^\s*\},/gm
const FIELD_RE = /^\s*(name|namespace|description):\s*("(?:[^"\\]|\\.)*"|'[^']*'),?\s*$/gm

const entries = []
const files = (await readdir(APIS_DIR)).filter(f => f.endsWith('.ts') && f !== 'types.ts')
for (const file of files.sort()) {
  const src = await readFile(join(APIS_DIR, file), 'utf8')
  const fileStem = file.replace(/\.ts$/, '')
  for (const m of src.matchAll(DEF_RE)) {
    const body = m[1]
    const fields = {}
    for (const fm of body.matchAll(FIELD_RE)) {
      fields[fm[1]] = JSON.parse(fm[2].replace(/^'(.*)'$/, '"$1"'))
    }
    if (!fields.name) continue
    entries.push({
      name: fields.name,
      namespace: fields.namespace ?? null,
      description: fields.description ?? '',
      namespaceFile: fileStem,
    })
  }
}

const header = `/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * AUTO-GENERATED from src/es/apis/*.ts via scripts/build-api-manifest.mjs.
 * DO NOT EDIT BY HAND. Regenerate after running the code generator.
 */
`

const ts = header + `
/** Cheap metadata for every Elasticsearch API command. No Zod schemas loaded. */
export interface EsApiMeta {
  readonly name: string
  readonly namespace: string | null
  readonly description: string
  /** File stem under src/es/apis/ that holds the full EsApiDefinition. */
  readonly namespaceFile: string
}

export const apiManifest: readonly EsApiMeta[] = ${JSON.stringify(entries, null, 2)} as const
`

await writeFile(OUT, ts)
console.log(`Wrote ${OUT} (${entries.length} entries from ${files.length} files)`)
