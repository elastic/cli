/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { tmpConfig } from './tmp-config.ts'

describe('tmpConfig', () => {
  it('points ELASTIC_CLI_CONFIG_FILE at a fresh file, then restores the env and removes the dir', async (t) => {
    const before = process.env['ELASTIC_CLI_CONFIG_FILE']
    let path = ''
    await t.test('inner', async (inner) => {
      path = await tmpConfig(inner, 'current_context: x\n')
      assert.equal(process.env['ELASTIC_CLI_CONFIG_FILE'], path)
      assert.equal(await readFile(path, 'utf-8'), 'current_context: x\n')
    })
    assert.equal(process.env['ELASTIC_CLI_CONFIG_FILE'], before)
    await assert.rejects(stat(path), { code: 'ENOENT' })
  })

  it('leaves the file unwritten when no contents are given', async (t) => {
    const path = await tmpConfig(t)
    await assert.rejects(stat(path), { code: 'ENOENT' })
  })
})
