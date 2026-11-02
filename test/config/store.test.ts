/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setResolvedConfig, getResolvedConfig, _testResetConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

// The store is a module-level singleton. Under `bun test` all files share one
// process, so other suites can leave state behind; reset before each test (not
// just after) so assertions about the initial state are order-independent.
beforeEach(() => {
  _testResetConfig()
})

afterEach(() => {
  _testResetConfig()
})

describe('store', () => {
  it('returns undefined before any config is set', () => {
    assert.equal(getResolvedConfig(), undefined)
  })

  it('returns the most recently set config until reset', () => {
    const first: ResolvedConfig = { context: { kibana: { url: 'https://kb:5601', auth: { api_key: 'a' } } } }
    const second: ResolvedConfig = { context: { elasticsearch: { url: 'https://es:9200', auth: { api_key: 'b' } } } }
    setResolvedConfig(first)
    setResolvedConfig(second)
    assert.deepEqual(getResolvedConfig(), second)
    _testResetConfig()
    assert.equal(getResolvedConfig(), undefined)
  })
})
