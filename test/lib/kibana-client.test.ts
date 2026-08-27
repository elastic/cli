/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { YamlResponse } from '../../src/lib/yaml-response.ts'
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

  it('follows redirects (so same-host redirect routes resolve instead of rejecting)', async () => {
    const client = makeClient()
    let capturedInit: RequestInit = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedInit = init
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(capturedInit.redirect, 'follow')
  })

  it('rejects a response that landed on a different origin after a redirect', async () => {
    const client = makeClient()
    client._testSetFetch(((() => {
      const resp = new Response('{}', { status: 200 })
      Object.defineProperty(resp, 'url', { value: 'https://evil.example.com/api/status' })
      return Promise.resolve(resp)
    }) as typeof fetch))

    await assert.rejects(
      client.request({ method: 'GET', path: '/api/status' }),
      /different origin/
    )
  })

  it('accepts a response that stayed on the configured origin after a redirect', async () => {
    const client = makeClient()
    client._testSetFetch(((() => {
      const resp = new Response('{"ok":true}', { status: 200 })
      Object.defineProperty(resp, 'url', { value: 'http://localhost:5601/api/status/' })
      return Promise.resolve(resp)
    }) as typeof fetch))

    assert.deepEqual(await client.request({ method: 'GET', path: '/api/status' }), { ok: true })
  })
})

describe('KibanaClient.request Server-Sent Events', () => {
  function makeClient () {
    return new KibanaClient('http://localhost:5601', { api_key: 'test-key' })
  }

  /** Builds a fetch stub that returns `body` with the given content-type. */
  function sseFetch (body: string, contentType: string): typeof fetch {
    return ((): Promise<Response> =>
      Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': contentType } }))
    ) as typeof fetch
  }

  it('parses a single text/event-stream event into [{ event, data }]', async () => {
    const client = makeClient()
    const body = 'event: conversation_id_set\ndata: {"data":{"conversation_id":"abc"}}\n\n'
    client._testSetFetch(sseFetch(body, 'text/event-stream'))

    const result = await client.request({ method: 'POST', path: '/api/agent_builder/converse/async', body: {} })
    assert.deepEqual(result, [
      { event: 'conversation_id_set', data: { data: { conversation_id: 'abc' } } },
    ])
  })

  it('parses SSE served as application/octet-stream (Kibana proxy workaround)', async () => {
    const client = makeClient()
    const body =
      'event: conversation_id_set\ndata: {"data":{"conversation_id":"ba61"}}\n\n' +
      ': 000000000000000000000000\n\n' +
      'event: round_complete\ndata: {"done":true}\n\n'
    client._testSetFetch(sseFetch(body, 'application/octet-stream'))

    const result = await client.request({ method: 'POST', path: '/api/agent_builder/converse/async', body: {} })
    assert.deepEqual(result, [
      { event: 'conversation_id_set', data: { data: { conversation_id: 'ba61' } } },
      { event: 'round_complete', data: { done: true } },
    ])
  })

  it('keeps non-JSON data as a raw string', async () => {
    const client = makeClient()
    const body = 'event: note\ndata: hello world\n\n'
    client._testSetFetch(sseFetch(body, 'text/event-stream'))

    const result = await client.request({ method: 'POST', path: '/x', body: {} })
    assert.deepEqual(result, [{ event: 'note', data: 'hello world' }])
  })

  it('matches text/event-stream with a charset suffix', async () => {
    const client = makeClient()
    const body = 'event: e\ndata: {"a":1}\n\n'
    client._testSetFetch(sseFetch(body, 'text/event-stream; charset=utf-8'))

    const result = await client.request({ method: 'POST', path: '/x', body: {} })
    assert.deepEqual(result, [{ event: 'e', data: { a: 1 } }])
  })

  it('does NOT treat an application/json body as SSE', async () => {
    const client = makeClient()
    client._testSetFetch(sseFetch('{"ok":true}', 'application/json'))

    const result = await client.request({ method: 'POST', path: '/x', body: {} })
    assert.deepEqual(result, { ok: true })
  })

  it('does NOT treat a non-SSE application/octet-stream body as SSE', async () => {
    const client = makeClient()
    client._testSetFetch(sseFetch('{"ok":true}', 'application/octet-stream'))

    const result = await client.request({ method: 'POST', path: '/x', body: {} })
    assert.deepEqual(result, { ok: true })
  })

  it('parses SSE when the content-type header is absent/empty', async () => {
    const client = makeClient()
    client._testSetFetch(sseFetch('event: e\ndata: {"a":1}\n\n', ''))

    const result = await client.request({ method: 'POST', path: '/x', body: {} })
    assert.deepEqual(result, [{ event: 'e', data: { a: 1 } }])
  })
})

describe('KibanaClient.request non-JSON bodies', () => {
  function makeClient () {
    return new KibanaClient('http://localhost:5601', { api_key: 'test-key' })
  }

  function rawFetch (body: string, contentType: string): typeof fetch {
    return ((): Promise<Response> =>
      Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': contentType } }))
    ) as typeof fetch
  }

  it('wraps an application/yaml body in a YamlResponse (agent-policy/k8s manifest download)', async () => {
    const client = makeClient()
    const yaml = 'apiVersion: v1\nkind: ConfigMap\n'
    client._testSetFetch(rawFetch(yaml, 'application/yaml'))

    const result = await client.request({ method: 'GET', path: '/api/fleet/kubernetes/download' })
    assert.ok(result instanceof YamlResponse)
    assert.equal(result.text, yaml)
  })

  it('returns a raw JavaScript body verbatim (oauth callback script)', async () => {
    const client = makeClient()
    const js = '(() => { window.location = "/" })()'
    client._testSetFetch(rawFetch(js, 'text/javascript'))

    const result = await client.request({ method: 'GET', path: '/oauth/callback' })
    assert.equal(result, js)
  })
})
