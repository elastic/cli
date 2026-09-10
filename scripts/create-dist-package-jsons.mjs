#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const content = '{"type":"module"}\n'

// Create package.json in each dist subdirectory to short-circuit Node.js's
// upward package.json walk when resolving module types, saving ENOENT syscalls.
const dirs = [
  'dist',
  'dist/cloud',
  'dist/completion',
  'dist/completion/completers',
  'dist/completion/shells',
  'dist/config',
  'dist/docs',
  'dist/es',
  'dist/extension',
  'dist/kb',
  'dist/lib',
  'dist/sanitize',
  'dist/status',
]

for (const dir of dirs) {
  const path = join(root, dir, 'package.json')
  if (existsSync(join(root, dir))) {
    writeFileSync(path, content)
  }
}
