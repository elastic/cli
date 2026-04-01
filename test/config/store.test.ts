/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setResolvedConfig, getResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

const sampleConfig: ResolvedConfig = {
  context: {
    elasticsearch: { url: 'https://localhost:9200', auth: { api_key: 'key123' } },
  },
}

afterEach(() => {
  // reset singleton state between tests
  setResolvedConfig(undefined as unknown as ResolvedConfig)
})

describe('store', () => {
  describe('getResolvedConfig', () => {
    it('returns undefined before any config is set', () => {
      assert.equal(getResolvedConfig(), undefined)
    })
  })

  describe('setResolvedConfig / getResolvedConfig', () => {
    it('returns the config that was set', () => {
      setResolvedConfig(sampleConfig)
      assert.deepEqual(getResolvedConfig(), sampleConfig)
    })

    it('returns the most recently set config when called multiple times', () => {
      const first: ResolvedConfig = { context: { kibana: { url: 'https://kb:5601', auth: { api_key: 'a' } } } }
      const second: ResolvedConfig = { context: { elasticsearch: { url: 'https://es:9200', auth: { api_key: 'b' } } } }
      setResolvedConfig(first)
      setResolvedConfig(second)
      assert.deepEqual(getResolvedConfig(), second)
    })

    it('stores the reference, not a copy', () => {
      setResolvedConfig(sampleConfig)
      assert.equal(getResolvedConfig(), sampleConfig)
    })
  })
})
