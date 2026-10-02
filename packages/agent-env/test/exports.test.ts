/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('published entry', () => {
  it('points main and exports at the built javascript', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
    assert.equal(pkg.main, './dist/index.js')
    assert.deepEqual(pkg.exports, {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
    })
  })

  it('loads dist from a real node_modules directory under plain node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-env-'))
    const dest = join(dir, 'node_modules', '@elastic', 'agent-env')
    cpSync(pkgRoot, dest, {
      recursive: true,
      filter: (src) => !src.includes(`${pkgRoot}/test`) && !src.includes(`${pkgRoot}/node_modules`),
    })
    writeFileSync(join(dir, 'load.mjs'), `
      const mod = await import('@elastic/agent-env')
      if (typeof mod.detectAgent !== 'function') throw new Error('detectAgent missing')
      const { createRequire } = await import('node:module')
      const req = createRequire(import.meta.url)
      const resolved = req.resolve('@elastic/agent-env')
      console.log(resolved)
    `)
    try {
      const resolved = execFileSync(process.execPath, ['load.mjs'], { cwd: dir, encoding: 'utf8' }).trim()
      assert.match(resolved, /\/node_modules\/@elastic\/agent-env\/dist\/index\.js$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
