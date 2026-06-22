/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { KibanaClient, getKibanaClient, _testResetKibanaClient } from '../../src/lib/kibana-client.ts'
import { setResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { clientHeaders } from '../../src/lib/meta.ts'

afterEach(() => {
  _testResetKibanaClient()
  setResolvedConfig({ context: {} } as ResolvedConfig)
})

describe('getKibanaClient', () => {
  it('throws missing_config when kibana is not configured', () => {
    setResolvedConfig({ context: {} } as ResolvedConfig)
    assert.throws(() => getKibanaClient(), /missing_config/)
  })

  it('returns a KibanaClient with api_key auth', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601', auth: { api_key: 'test-key' } } } })
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
  })

  it('returns a KibanaClient with basic auth', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601', auth: { username: 'elastic', password: 'changeme' } } } })
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
  })

  it('creates a client without credentials when auth shape is unrecognized', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601', auth: {} } } } as unknown as ResolvedConfig)
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
  })

  it('caches the instance (singleton per invocation)', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601', auth: { api_key: 'k' } } } })
    assert.strictEqual(getKibanaClient(), getKibanaClient())
  })

  it('_testResetKibanaClient clears the cached instance', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601', auth: { api_key: 'k' } } } })
    const first = getKibanaClient()
    _testResetKibanaClient()
    const second = getKibanaClient()
    assert.notStrictEqual(first, second)
  })

  it('strips trailing slash from baseUrl', () => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601/', auth: { api_key: 'k' } } } })
    const client = getKibanaClient()
    assert.equal(client.baseUrl, 'http://localhost:5601')
  })
})

describe('KibanaClient.request', () => {
  function makeClient (auth: { api_key: string } | { username: string; password: string } = { api_key: 'test-key' }) {
    return new KibanaClient('http://localhost:5601', auth)
  }

  async function captureDebugOutput (fn: () => Promise<unknown>): Promise<string> {
    const chunks: string[] = []
    const origWrite = process.stderr.write
    const previousDebug = process.env['ELASTIC_DEBUG']
    process.env['ELASTIC_DEBUG'] = '1'
    process.stderr.write = ((chunk: string) => { chunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      await fn()
    } finally {
      process.stderr.write = origWrite
      if (previousDebug === undefined) delete process.env['ELASTIC_DEBUG']
      else process.env['ELASTIC_DEBUG'] = previousDebug
    }
    return chunks.join('')
  }

  it('includes x-elastic-client-meta and user-agent on every request', async () => {
    const client = makeClient()
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    const expected = clientHeaders()
    assert.equal(capturedHeaders['x-elastic-client-meta'], expected['x-elastic-client-meta'])
    assert.equal(capturedHeaders['user-agent'], expected['user-agent'])
  })

  it('sends ApiKey Authorization header', async () => {
    const client = makeClient({ api_key: 'my-key' })
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(capturedHeaders['Authorization'], 'ApiKey my-key')
  })

  it('sends Basic Authorization header for username/password', async () => {
    const client = makeClient({ username: 'elastic', password: 'changeme' })
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    const expected = `Basic ${Buffer.from('elastic:changeme').toString('base64')}`
    assert.equal(capturedHeaders['Authorization'], expected)
  })

  it('adds kbn-xsrf for non-GET/HEAD requests', async () => {
    const client = makeClient()
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/api/saved_objects', body: {} })
    assert.equal(capturedHeaders['kbn-xsrf'], 'true')
  })

  it('does not add kbn-xsrf for GET requests', async () => {
    const client = makeClient()
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    assert.ok(!('kbn-xsrf' in capturedHeaders))
  })

  it('composes URL from baseUrl and path', async () => {
    const client = makeClient()
    const urls: string[] = []
    client._testSetFetch(((url: string) => {
      urls.push(url)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(urls[0], 'http://localhost:5601/api/status')
  })

  it('appends querystring to URL', async () => {
    const client = makeClient()
    const urls: string[] = []
    client._testSetFetch(((url: string) => {
      urls.push(url)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/saved_objects', querystring: { type: 'dashboard', perPage: 10 } })
    const parsed = new URL(urls[0]!)
    assert.equal(parsed.searchParams.get('type'), 'dashboard')
    assert.equal(parsed.searchParams.get('perPage'), '10')
  })

  it('throws on non-2xx response', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"message":"not found"}', { status: 404 }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'GET', path: '/api/missing' }),
      (err: Error) => {
        assert.match(err.message, /404/)
        return true
      }
    )
  })

  it('returns empty object for empty response body', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('', { status: 200 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'DELETE', path: '/api/saved_objects/dashboard/id' })
    assert.deepEqual(result, {})
  })

  it('logs sanitized debug output when ELASTIC_DEBUG=1', async () => {
    const client = makeClient({ username: 'elastic', password: 'changeme' })
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"id":"1"}', { status: 200 }))
    ) as typeof fetch)

    const stderr = await captureDebugOutput(() =>
      client.request({ method: 'POST', path: '/api/saved_objects', body: { attributes: { title: 'Dashboard' } } })
    )

    assert.match(stderr, /POST http:\/\/localhost:5601\/api\/saved_objects/)
    assert.match(stderr, /Authorization: \(redacted\)/)
    assert.match(stderr, /kbn-xsrf: true/)
    assert.match(stderr, /\{"attributes":\{"title":"Dashboard"\}\}/)
    assert.match(stderr, /Response: 200/)
    assert.match(stderr, /\{"id":"1"\}/)
    assert.doesNotMatch(stderr, /changeme/)
  })

  it('sets redirect to error', async () => {
    const client = makeClient()
    let capturedInit: RequestInit = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedInit = init
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(capturedInit.redirect, 'error')
  })
})
