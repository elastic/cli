#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Inserts `// @ts-nocheck` into every emitted per-endpoint Zod schema file so
 * `tsc` doesn't OOM trying to type-check 46 MB of Zod-generic types. The
 * directive is placed *after* the SPDX header block so the repo-wide SPDX
 * check still passes (first four non-shebang lines must be the canonical
 * header); TypeScript honours `@ts-nocheck` anywhere before the first
 * non-comment code.
 *
 * Tracked upstream: elastic/elastic-client-generator-js#166.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(fileURLToPath(import.meta.url), '..', '..', 'src', 'es', 'apis', 'schemas')
const DIRECTIVE = '// @ts-nocheck\n'
const HEADER_END = ' */'

const files = (await readdir(DIR)).filter(f => f.endsWith('.ts'))
let patched = 0
for (const f of files) {
  const p = join(DIR, f)
  const src = await readFile(p, 'utf8')
  const lines = src.split('\n')

  // strip any erroneously-leading directive from older pipeline runs
  if (lines[0] === '// @ts-nocheck') lines.shift()

  // find the SPDX header close (`*/` on the first comment block)
  const closeIdx = lines.findIndex(l => l === HEADER_END)
  if (closeIdx < 0) {
    throw new Error(`no SPDX header found in ${f}`)
  }

  // already correctly placed? (directive on the first non-blank line after `*/`)
  const afterHeader = lines.slice(closeIdx + 1)
  const firstNonBlank = afterHeader.find(l => l.trim() !== '')
  if (firstNonBlank === '// @ts-nocheck') {
    await writeFile(p, lines.join('\n'))
    continue
  }

  lines.splice(closeIdx + 1, 0, '', DIRECTIVE.trimEnd())
  await writeFile(p, lines.join('\n'))
  patched++
}
console.log(`Re-placed @ts-nocheck in ${patched} of ${files.length} schema files`)
