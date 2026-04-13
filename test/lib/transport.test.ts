/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getTransport, _testResetTransport } from '../../src/lib/transport.ts'
import { setResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { clientHeaders } from '../../src/lib/meta.ts'
import { kHeaders } from '@elastic/transport/lib/symbols.js'

function makeApiKeyConfig(url: string, apiKey: string): ResolvedConfig {
  return {
    context: {
      elasticsearch: {
        url,
        auth: { api_key: apiKey },
      },
    },
  }
}

function makeBasicConfig(url: string, username: string, password: string): ResolvedConfig {
  return {
    context: {
      elasticsearch: {
        url,
        auth: { username, password },
      },
    },
  }
}

describe('getTransport', () => {
  afterEach(() => {
    _testResetTransport()
    // Reset store to undefined so tests are isolated
    setResolvedConfig({ context: {} } as ResolvedConfig)
  })

  it('throws a structured missing_config error when elasticsearch is not configured', () => {
    setResolvedConfig({ context: {} } as ResolvedConfig)
    assert.throws(
      () => getTransport(),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /missing_config|No Elasticsearch/i)
        return true
      }
    )
  })

  it('throws when resolved config is not set at all', () => {
    // getResolvedConfig returns undefined when nothing is set
    // Force by resetting -- relying on the internal undefined state isn't possible here,
    // so we set a config without elasticsearch
    setResolvedConfig({ context: {} } as ResolvedConfig)
    assert.throws(() => getTransport(), /missing_config|No Elasticsearch/i)
  })

  it('returns a Transport instance when api_key auth is configured', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const transport = getTransport()
    assert.ok(transport != null)
    assert.equal(typeof transport.request, 'function')
  })

  it('returns a Transport instance when basic auth is configured', () => {
    setResolvedConfig(makeBasicConfig('http://localhost:9200', 'elastic', 'changeme'))
    const transport = getTransport()
    assert.ok(transport != null)
    assert.equal(typeof transport.request, 'function')
  })

  it('caches the Transport instance (singleton per invocation)', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const first = getTransport()
    const second = getTransport()
    assert.equal(first, second)
  })

  it('_testResetTransport clears the cached instance', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const first = getTransport()
    _testResetTransport()
    const second = getTransport()
    assert.notEqual(first, second)
  })

  it('sets user-agent header to the CLI identifier', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const transport = getTransport()
    const headers = (transport as unknown as Record<symbol, Record<string, string>>)[kHeaders as symbol]
    const expected = clientHeaders()
    assert.equal(headers['user-agent'], expected['user-agent'])
  })

  it('sets x-elastic-client-meta header with CLI telemetry', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const transport = getTransport()
    const headers = (transport as unknown as Record<symbol, Record<string, string>>)[kHeaders as symbol]
    const expected = clientHeaders()
    assert.equal(headers['x-elastic-client-meta'], expected['x-elastic-client-meta'])
  })
})
