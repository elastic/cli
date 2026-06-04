/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerCloudCommandsLazy } from '../../src/cloud/register-lazy.ts'

describe('registerCloudCommandsLazy', () => {
  it('returns a top-level "cloud" group (no sub-namespace)', async () => {
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

  it('builds real tree when targetSubNamespace is set', async () => {
    const group = await registerCloudCommandsLazy('hosted')
    assert.equal(group.name(), 'cloud')
    const hosted = group.commands.find(c => c.name() === 'hosted')
    assert.ok(hosted != null, 'should have hosted group')
    assert.ok(hosted.commands.length > 0, 'hosted should have sub-commands in real tree')
  })
})