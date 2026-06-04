/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerCloudCommandsLazy } from '../../src/cloud/register-lazy.ts'

describe('registerCloudCommandsLazy', () => {
  const ORIGINAL_ARGV = process.argv.slice()

  before(() => {
    // Simulate `elastic cloud --help` (top-level, no sub-group)
    process.argv.splice(2)
    process.argv.push('cloud', '--help')
  })

  after(() => {
    process.argv.splice(0)
    ORIGINAL_ARGV.forEach(a => process.argv.push(a))
  })

  it('returns a top-level "cloud" group', async () => {
    const group = await registerCloudCommandsLazy()
    assert.equal(group.name(), 'cloud')
  })

  it('registers the expected top-level stub groups', async () => {
    const group = await registerCloudCommandsLazy()
    const names = group.commands.map((c) => c.name()).sort()
    assert.ok(names.includes('hosted'), 'should have hosted')
    assert.ok(names.includes('serverless'), 'should have serverless')
    assert.ok(names.includes('users'), 'should have users')
  })

  it('builds real tree when a sub-group is targeted', async () => {
    // Simulate `elastic cloud hosted --help`
    process.argv.splice(2)
    process.argv.push('cloud', 'hosted', '--help')
    const group = await registerCloudCommandsLazy()
    assert.equal(group.name(), 'cloud')
    // Real tree has actual sub-commands under hosted
    const hosted = group.commands.find(c => c.name() === 'hosted')
    assert.ok(hosted != null, 'should have hosted group')
    assert.ok(hosted.commands.length > 0, 'hosted should have sub-commands in real tree')
  })
})
