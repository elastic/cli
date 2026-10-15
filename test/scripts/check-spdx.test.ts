/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = join(import.meta.dirname, '../../scripts/check-spdx.mjs')
const header = '/*\n * Copyright Elasticsearch B.V. and contributors\n * SPDX-License-Identifier: Apache-2.0\n */\n'

function run (cwd: string) {
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' })
}

describe('check-spdx', () => {
  it('passes good files (including after a shebang) and ignores excluded dirs and other extensions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-spdx-'))
    mkdirSync(join(dir, 'sub dir'))
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'sub dir', 'good file.ts'), `${header}export {}\n`)
    writeFileSync(join(dir, 'cli.mjs'), `#!/usr/bin/env node\n${header}`)
    writeFileSync(join(dir, 'node_modules', 'dep.js'), 'module.exports = 1\n')
    writeFileSync(join(dir, 'notes.md'), '# no header\n')
    const res = run(dir)
    assert.equal(res.status, 0, res.stdout + res.stderr)
    assert.equal(res.stdout, '')
  })

  it('prints only failures and exits 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-spdx-'))
    writeFileSync(join(dir, 'good.js'), header)
    writeFileSync(join(dir, 'bad.js'), header.replace('/*', '/**'))
    const res = run(dir)
    assert.equal(res.status, 1)
    assert.equal(res.stdout, 'Incorrect: bad.js\n')
  })
})
