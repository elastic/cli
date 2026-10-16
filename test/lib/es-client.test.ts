/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EsClient, EsResponseError, getEsClient, _testResetEsClient } from '../../src/lib/es-client.ts'
import { setResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { YamlResponse } from '../../src/lib/yaml-response.ts'

function makeApiKeyConfig (url: string, apiKey: string): ResolvedConfig {
  return { context: { elasticsearch: { url, auth: { api_key: apiKey } } } }
}

function makeBasicConfig (url: string, username: string, password: string): ResolvedConfig {
  return { context: { elasticsearch: { url, auth: { username, password } } } }
}

afterEach(() => {
  _testResetEsClient()
  setResolvedConfig({ context: {} } as ResolvedConfig)
})

describe('getEsClient', () => {
  it('throws when elasticsearch is not configured', () => {
    setResolvedConfig({ context: {} } as ResolvedConfig)
    assert.throws(() => getEsClient(), /missing_config|No Elasticsearch/i)
  })

  it('returns an EsClient with api_key auth', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'test-api-key'))
    const client = getEsClient()
    assert.ok(client instanceof EsClient)
    assert.equal(typeof client.request, 'function')
  })

  it('returns an EsClient with basic auth', () => {
    setResolvedConfig(makeBasicConfig('http://localhost:9200', 'elastic', 'changeme'))
    const client = getEsClient()
    assert.ok(client instanceof EsClient)
  })

  it('returns an EsClient without credentials when auth is absent', () => {
    setResolvedConfig({ context: { elasticsearch: { url: 'http://localhost:9200' } } } as unknown as ResolvedConfig)
    const client = getEsClient()
    assert.ok(client instanceof EsClient)
  })

  it('caches the instance (singleton per invocation)', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'key'))
    assert.strictEqual(getEsClient(), getEsClient())
  })

  it('_testResetEsClient clears the cached instance', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200', 'key'))
    const first = getEsClient()
    _testResetEsClient()
    const second = getEsClient()
    assert.notStrictEqual(first, second)
  })

  it('strips trailing slash from baseUrl', () => {
    setResolvedConfig(makeApiKeyConfig('http://localhost:9200/', 'key'))
    const client = getEsClient()
    assert.equal(client.baseUrl, 'http://localhost:9200')
  })

  it('sends the configured credentials', async () => {
    async function authHeader (config: ResolvedConfig): Promise<string | undefined> {
      _testResetEsClient()
      setResolvedConfig(config)
      const client = getEsClient()
      let header: string | undefined
      client._testSetFetch(((url: string, init: RequestInit) => {
        header = (init.headers as Record<string, string>)['Authorization']
        return Promise.resolve(new Response('', { status: 200 }))
      }) as typeof fetch)
      await client.request({ method: 'GET', path: '/' })
      return header
    }

    assert.equal(await authHeader(makeApiKeyConfig('http://localhost:9200', 'k')), 'ApiKey k')
    assert.equal(await authHeader(makeBasicConfig('http://localhost:9200', 'u', 'p')), `Basic ${Buffer.from('u:p').toString('base64')}`)
    assert.equal(await authHeader({ context: { elasticsearch: { url: 'http://localhost:9200' } } }), undefined)
  })
})

describe('EsClient.request', () => {
  function makeClient (auth?: { api_key: string } | { username: string; password: string }) {
    return new EsClient('http://localhost:9200', auth ?? { api_key: 'test-key' })
  }

  it('sends ApiKey Authorization header', async () => {
    const client = makeClient({ api_key: 'my-api-key' })
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/' })
    assert.equal(capturedHeaders['Authorization'], 'ApiKey my-api-key')
  })

  it('sends Basic Authorization header for username/password', async () => {
    const client = makeClient({ username: 'elastic', password: 'changeme' })
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/' })
    const expected = `Basic ${Buffer.from('elastic:changeme').toString('base64')}`
    assert.equal(capturedHeaders['Authorization'], expected)
  })

  it('omits Authorization header when no auth is provided', async () => {
    const client = new EsClient('http://localhost:9200')
    let capturedHeaders: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/' })
    assert.equal(capturedHeaders['Authorization'], undefined)
  })

  it('sends object body as JSON with application/json content-type', async () => {
    const client = makeClient()
    const calls: { body: unknown; headers: Record<string, string> }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ body: init.body, headers: init.headers as Record<string, string> })
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/_search', body: { query: { match_all: {} } } })
    assert.equal(calls[0]!.body, JSON.stringify({ query: { match_all: {} } }))
    assert.equal(calls[0]!.headers['Content-Type'], 'application/json')
  })

  it('sends string body as-is with application/json content-type', async () => {
    const client = makeClient()
    const calls: { body: unknown; headers: Record<string, string> }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ body: init.body, headers: init.headers as Record<string, string> })
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/_search', body: '{"query":{"match_all":{}}}' })
    assert.equal(calls[0]!.body, '{"query":{"match_all":{}}}')
    assert.equal(calls[0]!.headers['Content-Type'], 'application/json')
  })

  it('sends bulkBody as NDJSON with application/x-ndjson content-type', async () => {
    const client = makeClient()
    const calls: { body: unknown; headers: Record<string, string> }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ body: init.body, headers: init.headers as Record<string, string> })
      return Promise.resolve(new Response('{"errors":false,"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    const ndjson = '{"index":{}}\n{"field":"value"}\n'
    await client.request({ method: 'POST', path: '/_bulk', bulkBody: ndjson })
    assert.equal(calls[0]!.body, ndjson)
    assert.equal(calls[0]!.headers['Content-Type'], 'application/x-ndjson')
  })

  it('sends bulkBody instead of body when both are set', async () => {
    const client = makeClient()
    const calls: RequestInit[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push(init)
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/_bulk', body: { ignored: true }, bulkBody: '{"index":{}}\n' })
    assert.equal(calls[0]!.body, '{"index":{}}\n')
    assert.equal((calls[0]!.headers as Record<string, string>)['Content-Type'], 'application/x-ndjson')
  })

  it('sends a GET with a body as POST', async () => {
    const client = makeClient()
    const calls: RequestInit[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push(init)
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/_search', body: { size: 0 } })
    await client.request({ method: 'GET', path: '/_search' })
    assert.equal(calls[0]!.method, 'POST')
    assert.equal(calls[1]!.method, 'GET')
  })

  it('lets opts.headers override the default Accept', async () => {
    const client = makeClient()
    const calls: RequestInit[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push(init)
      return Promise.resolve(new Response('', { status: 200 }))
    }) as typeof fetch)

    await client.request({ method: 'GET', path: '/_cat/indices' }, { headers: { Accept: 'text/plain' } })
    assert.equal((calls[0]!.headers as Record<string, string>)['Accept'], 'text/plain')
  })

  it('allows opts.headers to override Content-Type', async () => {
    const client = makeClient()
    const calls: { headers: Record<string, string> }[] = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      calls.push({ headers: init.headers as Record<string, string> })
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    await client.request(
      { method: 'POST', path: '/_bulk', body: 'raw-ndjson' },
      { headers: { 'content-type': 'application/x-ndjson' } }
    )
    assert.equal(calls[0]!.headers['content-type'], 'application/x-ndjson')
  })

  it('returns parsed JSON when response content-type is application/json', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"hits":{"total":1}}', { status: 200, headers: { 'content-type': 'application/json' } }))
    ) as typeof fetch)

    const result = await client.request({ method: 'GET', path: '/_search' })
    assert.deepEqual(result, { hits: { total: 1 } })
  })

  it('returns raw string when response content-type is text', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('index  health  status\n', { status: 200, headers: { 'content-type': 'text/plain' } }))
    ) as typeof fetch)

    const result = await client.request({ method: 'GET', path: '/_cat/indices' })
    assert.equal(result, 'index  health  status\n')
  })

  it('parses an application/x-ndjson response as JSON', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"responses":[]}', { status: 200, headers: { 'content-type': 'application/x-ndjson' } }))
    ) as typeof fetch)

    assert.deepEqual(await client.request({ method: 'POST', path: '/_msearch' }), { responses: [] })
  })

  it('returns raw text for a JSON-looking body without a JSON content-type', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"a":1}', { status: 200, headers: { 'content-type': 'text/plain' } }))
    ) as typeof fetch)

    assert.equal(await client.request({ method: 'GET', path: '/_cat/health' }), '{"a":1}')
  })

  it('wraps a YAML response in a YamlResponse', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('a: 1\n', { status: 200, headers: { 'content-type': 'application/yaml' } }))
    ) as typeof fetch)

    const result = await client.request({ method: 'GET', path: '/_cluster/health' })
    assert.ok(result instanceof YamlResponse)
    assert.equal(result.text, 'a: 1\n')
  })

  it('returns empty object for empty response body', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('', { status: 200 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'DELETE', path: '/my-index' })
    assert.deepEqual(result, {})
  })

  it('throws EsResponseError on non-2xx status', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response(JSON.stringify({ error: { type: 'index_not_found_exception' } }), { status: 404, headers: { 'content-type': 'application/json' } }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'GET', path: '/missing-index' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 404)
        return true
      }
    )
  })

  it('parses a JSON error body and uses its error field as the message', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"error":{"type":"index_not_found_exception"},"status":404}', { status: 404 }))
    ) as typeof fetch)

    await assert.rejects(client.request({ method: 'GET', path: '/missing-index' }), (err: unknown) => {
      assert.ok(err instanceof EsResponseError)
      assert.deepEqual(err.body, { error: { type: 'index_not_found_exception' }, status: 404 })
      assert.equal(err.message, '{"type":"index_not_found_exception"}')
      return true
    })
  })

  it('throws EsResponseError with HTML body on non-2xx (e.g. 504 from proxy)', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('<html><body>504 Gateway Time-out</body></html>', { status: 504, headers: { 'content-type': 'text/html' } }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'POST', path: '/_esql/query' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 504)
        assert.ok(typeof err.body === 'string', 'body should be a string for non-JSON error')
        assert.match(err.body as string, /504/)
        return true
      }
    )
  })

  it('throws EsResponseError with plain-text body on non-2xx', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('Service Unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'GET', path: '/_cluster/health' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 503)
        assert.equal(err.body, 'Service Unavailable')
        return true
      }
    )
  })

  it('throws EsResponseError with empty body on non-2xx', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('', { status: 502 }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'GET', path: '/' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 502)
        assert.equal(err.body, '')
        return true
      }
    )
  })

  it('returns true for HEAD requests with 2xx status', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response(null, { status: 200 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'HEAD', path: '/my-index' })
    assert.equal(result, true)
  })

  it('returns false for HEAD requests with 404 status', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response(null, { status: 404 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'HEAD', path: '/missing-index' })
    assert.equal(result, false)
  })

  it('throws EsResponseError for HEAD requests with non-404 error status', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    ) as typeof fetch)

    await assert.rejects(
      () => client.request({ method: 'HEAD', path: '/restricted-index' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })
})
