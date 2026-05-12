/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getCachedConfig, setCachedConfig, clearCachedConfig } from '../../src/config/cache.ts'
import type { LoadConfigResult } from '../../src/config/loader.ts'

const okResult: LoadConfigResult = {
  ok: true,
  value: {
    context: {
      elasticsearch: { url: 'https://localhost:9200', auth: { api_key: 'key123' } },
    },
  },
}

const errResult: LoadConfigResult = {
  ok: false,
  error: { message: 'No configuration file found' },
}

afterEach(() => {
  clearCachedConfig()
})

describe('config cache', () => {
  describe('getCachedConfig', () => {
    it('returns undefined before anything is cached', () => {
      assert.equal(getCachedConfig(), undefined)
    })
  })

  describe('setCachedConfig / getCachedConfig', () => {
    it('returns a cached ok result', () => {
      setCachedConfig(okResult)
      assert.deepEqual(getCachedConfig(), okResult)
    })

    it('returns a cached error result', () => {
      setCachedConfig(errResult)
      assert.deepEqual(getCachedConfig(), errResult)
    })

    it('returns the most recently cached result when called multiple times', () => {
      setCachedConfig(errResult)
      setCachedConfig(okResult)
      assert.deepEqual(getCachedConfig(), okResult)
    })

    it('stores the reference, not a copy', () => {
      setCachedConfig(okResult)
      assert.equal(getCachedConfig(), okResult)
    })
  })

  describe('clearCachedConfig', () => {
    it('resets the cache to undefined', () => {
      setCachedConfig(okResult)
      clearCachedConfig()
      assert.equal(getCachedConfig(), undefined)
    })

    it('is safe to call multiple times', () => {
      clearCachedConfig()
      clearCachedConfig()
      assert.equal(getCachedConfig(), undefined)
    })

    it('is safe to call before anything is cached', () => {
      assert.doesNotThrow(() => clearCachedConfig())
      assert.equal(getCachedConfig(), undefined)
    })
  })
})
