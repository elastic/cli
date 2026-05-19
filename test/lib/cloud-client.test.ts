/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getCloudClient, _testResetCloudClient } from '../../src/lib/cloud-client.ts'
import { setResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { clientHeaders } from '../../src/lib/meta.ts'

afterEach(() => {
  _testResetCloudClient()
  setResolvedConfig(undefined as unknown as ResolvedConfig)
})

describe('getCloudClient', () => {
  it('throws missing_config when no cloud service is configured', () => {
    setResolvedConfig({ context: { elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'x' } } } })
    assert.throws(() => getCloudClient(), /missing_config/)
  })

  it('throws missing_config when no config is set at all', () => {
    assert.throws(() => getCloudClient(), /missing_config/)
  })

  it('returns a client with the correct baseUrl', () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'test-key' } } } })
    const client = getCloudClient()
    assert.equal(client.baseUrl, 'https://api.elastic-cloud.com')
  })

  it('strips trailing slash from baseUrl', () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com/', auth: { api_key: 'test-key' } } } })
    const client = getCloudClient()
    assert.equal(client.baseUrl, 'https://api.elastic-cloud.com')
  })

  it('returns the same cached instance on repeated calls', () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const a = getCloudClient()
    const b = getCloudClient()
    assert.strictEqual(a, b)
  })

  it('returns a fresh instance after _testResetCloudClient', () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const a = getCloudClient()
    _testResetCloudClient()
    const b = getCloudClient()
    assert.notStrictEqual(a, b)
  })

  it('client.request makes a fetch call with correct method, url, headers', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'my-key' } } } })
    const client = getCloudClient()

    const calls: { url: string; init: RequestInit }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    }) as typeof fetch)

    const result = await client.request({ method: 'GET', path: '/api/v1/deployments' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, 'https://api.elastic-cloud.com/api/v1/deployments')
    assert.equal(calls[0]!.init.method, 'GET')
    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], 'ApiKey my-key')
    assert.deepEqual(result, { ok: true })
  })

  it('client.request includes query string when provided', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    const calls: { url: string }[] = []
    client._testSetFetch(((url: string) => {
      calls.push({ url })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/v1/deployments', querystring: { show_metadata: 'true', limit: '10' } })
    const parsed = new URL(calls[0]!.url)
    assert.equal(parsed.searchParams.get('show_metadata'), 'true')
    assert.equal(parsed.searchParams.get('limit'), '10')
  })

  it('client.request sends JSON body when provided', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    const calls: { init: RequestInit }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ init })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/api/v1/deployments', body: { name: 'test' } })
    assert.equal(calls[0]!.init.body, JSON.stringify({ name: 'test' }))
  })

  it('client.request throws on non-2xx response', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    client._testSetFetch((() =>
      Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'not found' }] }), { status: 404 }))
    ) as typeof fetch)

    await assert.rejects(() => client.request({ method: 'GET', path: '/api/v1/bad' }), (err: Error) => {
      assert.match(err.message, /404/)
      return true
    })
  })

  it('sends ApiKey authorization header', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'secret-key' } } } })
    const client = getCloudClient()

    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/test' })
    assert.equal(capturedHeaders['Authorization'], 'ApiKey secret-key')
  })

  it('includes x-elastic-client-meta and user-agent on every request', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/test' })
    const expected = clientHeaders()
    assert.equal(capturedHeaders['x-elastic-client-meta'], expected['x-elastic-client-meta'])
    assert.equal(capturedHeaders['user-agent'], expected['user-agent'])
  })

  it('throws missing_config when auth has no api_key', () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: {} } } } as unknown as ResolvedConfig)
    assert.throws(() => getCloudClient(), /missing_config/)
  })

  it('handles empty response body without throwing', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    client._testSetFetch((() =>
      Promise.resolve(new Response('', { status: 200 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'DELETE', path: '/api/v1/something' })
    assert.deepEqual(result, {})
  })

  it('warns on plaintext HTTP for non-localhost URLs (#107)', () => {
    const chunks: string[] = []
    const origWrite = process.stderr.write
    process.stderr.write = ((chunk: string) => { chunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      setResolvedConfig({ context: { cloud: { url: 'http://cloud.example.com', auth: { api_key: 'k' } } } })
      getCloudClient()
      assert.ok(chunks.some((c) => c.includes('plaintext HTTP')), 'should warn about plaintext HTTP')
    } finally {
      process.stderr.write = origWrite
    }
  })

  it('sets redirect to error to prevent credential forwarding (#108)', async () => {
    setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
    const client = getCloudClient()

    let capturedInit: RequestInit = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedInit = init
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/test' })
    assert.equal(capturedInit.redirect, 'error', 'redirect must be set to error')
  })

  it('does not warn on HTTP for localhost', () => {
    const chunks: string[] = []
    const origWrite = process.stderr.write
    process.stderr.write = ((chunk: string) => { chunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      setResolvedConfig({ context: { cloud: { url: 'http://localhost:9200', auth: { api_key: 'k' } } } })
      getCloudClient()
      assert.ok(!chunks.some((c) => c.includes('plaintext HTTP')), 'should not warn for localhost')
    } finally {
      process.stderr.write = origWrite
    }
  })

  describe('ELASTIC_CLOUD_ADMIN_API path rewrite', () => {
    let savedEnv: string | undefined

    beforeEach(() => {
      savedEnv = process.env['ELASTIC_CLOUD_ADMIN_API']
    })

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env['ELASTIC_CLOUD_ADMIN_API']
      } else {
        process.env['ELASTIC_CLOUD_ADMIN_API'] = savedEnv
      }
    })

    it('rewrites serverless paths when ELASTIC_CLOUD_ADMIN_API=true', async () => {
      process.env['ELASTIC_CLOUD_ADMIN_API'] = 'true'
      setResolvedConfig({ context: { cloud: { url: 'https://admin.qa.cld.elstc.co', auth: { api_key: 'k' } } } })
      const client = getCloudClient()

      const calls: { url: string }[] = []
      client._testSetFetch(((url: string) => {
        calls.push({ url })
        return Promise.resolve(new Response('[]', { status: 200 }))
      }) as typeof fetch)

      await client.request({ method: 'GET', path: '/api/v1/serverless/regions' })
      assert.equal(calls[0]!.url, 'https://admin.qa.cld.elstc.co/api/v1/admin/serverless/regions')
    })

    it('does not rewrite paths when env var is not set', async () => {
      delete process.env['ELASTIC_CLOUD_ADMIN_API']
      setResolvedConfig({ context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } } } })
      const client = getCloudClient()

      const calls: { url: string }[] = []
      client._testSetFetch(((url: string) => {
        calls.push({ url })
        return Promise.resolve(new Response('[]', { status: 200 }))
      }) as typeof fetch)

      await client.request({ method: 'GET', path: '/api/v1/serverless/regions' })
      assert.equal(calls[0]!.url, 'https://api.elastic-cloud.com/api/v1/serverless/regions')
    })
  })
})
