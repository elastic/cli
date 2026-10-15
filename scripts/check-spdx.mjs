#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Checks every .ts/.js/.mjs file under the cwd starts with the SPDX header
// (after an optional shebang). Walks the filesystem rather than asking the VCS
// so it works the same in git and jj checkouts and on every OS.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADER = [
  '/*',
  ' * Copyright Elasticsearch B.V. and contributors',
  ' * SPDX-License-Identifier: Apache-2.0',
  ' */'
].join('\n')

// Build output, dependencies, and VCS metadata: never source we author.
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.jj'])

function * walk (dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) yield * walk(path)
    } else if (/\.(ts|js|mjs)$/.test(entry.name)) {
      yield path
    }
  }
}

let failed = false
for (const file of walk('.')) {
  const head = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => !line.startsWith('#!'))
    .slice(0, 4)
    .join('\n')
  if (head !== HEADER) {
    console.log(`Incorrect: ${file}`)
    failed = true
  }
}

process.exit(failed ? 1 : 0)
