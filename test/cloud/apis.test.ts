/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadCloudApis } from '../../src/cloud/apis.ts'

describe('loadCloudApis', () => {
  it('loads and memoises the full set of Cloud API definitions', async () => {
    const first = await loadCloudApis()
    assert.ok(first.length > 0)
    const second = await loadCloudApis()
    // second call hits the in-memory cache instead of re-importing/re-resolving
    assert.equal(first, second)
  })
})
