/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { YamlResponse } from '../../src/lib/yaml-response.ts'
import { KibanaClient, getKibanaClient, _testResetKibanaClient } from '../../src/lib/kibana-client.ts'
import { HttpResponseError } from '../../src/lib/http-errors.ts'
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

  it('sends the configured credentials', async () => {
    async function authHeader (config: ResolvedConfig): Promise<string | undefined> {
      _testResetKibanaClient()
      setResolvedConfig(config)
      const client = getKibanaClient()
      let header: string | undefined
      client._testSetFetch(((url: string, init: RequestInit) => {
        header = (init.headers as Record<string, string>)['Authorization']
        return Promise.resolve(new Response('', { status: 200 }))
      }) as typeof fetch)
      await client.request({ method: 'GET', path: '/' })
      return header
    }

    const url = 'http://localhost:5601'
    assert.equal(await authHeader({ context: { kibana: { url, auth: { api_key: 'k' } } } }), 'ApiKey k')
    assert.equal(await authHeader({ context: { kibana: { url, auth: { username: 'u', password: 'p' } } } }), `Basic ${Buffer.from('u:p').toString('base64')}`)
    assert.equal(await authHeader({ context: { kibana: { url } } }), undefined)
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

  it('throws HttpResponseError carrying the status and raw body', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('{"message":"not found"}', { status: 404 }))
    ) as typeof fetch)

    await assert.rejects(client.request({ method: 'GET', path: '/api/missing' }), (err: unknown) => {
      assert.ok(err instanceof HttpResponseError)
      assert.equal(err.statusCode, 404)
      assert.equal(err.body, '{"message":"not found"}')
      assert.equal(String(err), 'Error: Kibana API error 404: {"message":"not found"}')
      return true
    })
  })

  it('returns empty object for empty response body', async () => {
    const client = makeClient()
    client._testSetFetch((() =>
      Promise.resolve(new Response('', { status: 200 }))
    ) as typeof fetch)

    const result = await client.request({ method: 'DELETE', path: '/api/saved_objects/dashboard/id' })
    assert.deepEqual(result, {})
  })
})

describe('KibanaClient.request redirects', () => {
  interface Hop {
    url: string
    init: RequestInit
    body: string | undefined
  }

  interface StubResponse {
    status: number
    location?: string
  }

  /**
   * Returns a client whose fetch answers with `responses` in order and records each hop.
   * The body is read through a real `Request` on every hop, so a body that cannot be
   * re-sent fails here. Every hop must carry a signal; it is left out of the recorded init.
   */
  function stubClient (responses: StubResponse[]) {
    const client = new KibanaClient('http://localhost:5601', { api_key: 'test-key' })
    const hops: Hop[] = []
    client._testSetFetch((async (url: string, { signal, ...init }: RequestInit) => {
      assert.ok(signal instanceof AbortSignal)
      const body = init.body == null ? undefined : await new Request(url, { method: init.method!, body: init.body }).text()
      hops.push({ url, init: { ...init, headers: { ...init.headers as Record<string, string> } }, body })
      const next = responses[hops.length - 1] ?? { status: 200 }
      const headers: Record<string, string> = next.location == null ? {} : { location: next.location }
      return new Response(next.status === 200 ? '{"ok":true}' : null, { status: next.status, headers })
    }) as typeof fetch)
    return { client, hops }
  }

  const baseHeaders = {
    ...clientHeaders(),
    Accept: 'application/json',
    Authorization: 'ApiKey test-key',
  }
  const postHeaders = { ...baseHeaders, 'kbn-xsrf': 'true', 'Content-Type': 'application/json' }

  it('sends redirect: manual', async () => {
    const { client, hops } = stubClient([])
    await client.request({ method: 'GET', path: '/api/status' })
    assert.deepEqual(hops[0]!.init, { method: 'GET', headers: baseHeaders, redirect: 'manual' })
  })

  for (const status of [307, 308]) {
    it(`follows a same-origin ${status} with the same method, headers, and body`, async () => {
      const { client, hops } = stubClient([{ status, location: '/api/agent_builder/a2a/next' }])
      const result = await client.request({ method: 'POST', path: '/api/agent_builder/a2a/agent', body: { a: 1 } })

      assert.deepEqual(result, { ok: true })
      assert.equal(hops.length, 2)
      assert.equal(hops[0]!.url, 'http://localhost:5601/api/agent_builder/a2a/agent')
      assert.equal(hops[1]!.url, 'http://localhost:5601/api/agent_builder/a2a/next')
      for (const hop of hops) {
        assert.deepEqual(hop.init, { method: 'POST', headers: postHeaders, redirect: 'manual', body: '{"a":1}' })
      }
    })
  }

  it('re-sends a multipart body on a same-origin 308', async () => {
    const tmpFile = path.join(os.tmpdir(), `kibana-redirect-test-${process.pid}.ndjson`)
    fs.writeFileSync(tmpFile, '{"type":"index-pattern"}\n')
    try {
      const { client, hops } = stubClient([{ status: 308, location: 'http://localhost:5601/api/saved_objects/_import2' }])
      await client.request({ method: 'POST', path: '/api/saved_objects/_import', multipartFields: { file: tmpFile } })

      assert.equal(hops.length, 2)
      for (const hop of hops) {
        assert.equal(hop.init.method, 'POST')
        assert.equal(hop.init.redirect, 'manual')
        assert.deepEqual(hop.init.headers, { ...baseHeaders, 'kbn-xsrf': 'true' })
        assert.ok(hop.init.body instanceof FormData)
        assert.match(hop.body!, /\{"type":"index-pattern"\}/)
      }
    } finally {
      fs.rmSync(tmpFile)
    }
  })

  it('rejects a cross-origin 307 without issuing the second request', async () => {
    const { client, hops } = stubClient([{ status: 307, location: 'https://evil.example.com/steal' }])
    await assert.rejects(
      client.request({ method: 'POST', path: '/api/saved_objects', body: { secret: 1 } }),
      /^Error: Kibana API error 307: refused redirect to a different origin \(https:\/\/evil\.example\.com\)$/
    )
    assert.equal(hops.length, 1)
  })

  it('throws HttpResponseError with the redirect status on a refused redirect', async () => {
    const { client } = stubClient([{ status: 307, location: 'https://evil.example.com/steal' }])
    await assert.rejects(client.request({ method: 'GET', path: '/api/status' }), (err: unknown) => {
      assert.ok(err instanceof HttpResponseError)
      assert.equal(err.statusCode, 307)
      return true
    })
  })

  for (const location of [
    '//evil.example.com/api/status',
    'https://kibana@evil.example.com/api/status',
    'http://localhost:5601@evil.example.com/api/status',
    'https://localhost:5601/api/status',
    'http://localhost:5602/api/status',
  ]) {
    it(`rejects adversarial Location ${location}`, async () => {
      const { client, hops } = stubClient([{ status: 307, location }])
      await assert.rejects(client.request({ method: 'GET', path: '/api/status' }), /Kibana API error 307: refused redirect to a different origin/)
      assert.equal(hops.length, 1)
    })
  }

  it('enforces the hop cap', async () => {
    const loop = { status: 307, location: '/api/loop' }
    const { client, hops } = stubClient([loop, loop, loop, loop])
    await assert.rejects(client.request({ method: 'GET', path: '/api/loop' }), /Kibana API error 307: too many redirects/)
    assert.equal(hops.length, 4)
  })

  it('follows up to the hop cap', async () => {
    const loop = { status: 307, location: '/api/loop' }
    const { client, hops } = stubClient([loop, loop, loop])
    assert.deepEqual(await client.request({ method: 'GET', path: '/api/loop' }), { ok: true })
    assert.equal(hops.length, 4)
  })

  it('rejects a redirect without a Location header', async () => {
    const { client, hops } = stubClient([{ status: 302 }])
    await assert.rejects(client.request({ method: 'GET', path: '/api/status' }), /Kibana API error 302: redirect without a Location header/)
    assert.equal(hops.length, 1)
  })

  it('switches a POST to GET and drops the body on a same-origin 303', async () => {
    const { client, hops } = stubClient([{ status: 303, location: '/api/result' }])
    await client.request({ method: 'POST', path: '/api/task', body: { secret: 1 } })

    assert.equal(hops.length, 2)
    assert.deepEqual(hops[0]!.init, { method: 'POST', headers: postHeaders, redirect: 'manual', body: '{"secret":1}' })
    assert.deepEqual(hops[1]!.init, { method: 'GET', headers: { ...baseHeaders, 'kbn-xsrf': 'true' }, redirect: 'manual' })
    assert.equal(hops[1]!.body, undefined)
  })

  for (const status of [301, 302]) {
    it(`switches a POST to GET and drops the body on a same-origin ${status}`, async () => {
      const { client, hops } = stubClient([{ status, location: '/api/result' }])
      await client.request({ method: 'POST', path: '/api/task', body: { secret: 1 } })

      assert.deepEqual(hops[1]!.init, { method: 'GET', headers: { ...baseHeaders, 'kbn-xsrf': 'true' }, redirect: 'manual' })
    })

    it(`keeps a PUT and its body on a same-origin ${status}`, async () => {
      const { client, hops } = stubClient([{ status, location: '/api/next' }])
      await client.request({ method: 'PUT', path: '/api/thing', body: { a: 1 } })

      assert.deepEqual(hops[1]!.init, { method: 'PUT', headers: postHeaders, redirect: 'manual', body: '{"a":1}' })
    })
  }

  it('follows a same-origin 301 on GET', async () => {
    const { client, hops } = stubClient([{ status: 301, location: '/api/status/' }])
    assert.deepEqual(await client.request({ method: 'GET', path: '/api/status' }), { ok: true })
    assert.equal(hops[1]!.url, 'http://localhost:5601/api/status/')
    assert.deepEqual(hops[1]!.init, { method: 'GET', headers: baseHeaders, redirect: 'manual' })
  })

  it('surfaces a non-redirect 3xx as a Kibana API error', async () => {
    const { client, hops } = stubClient([{ status: 304 }])
    await assert.rejects(client.request({ method: 'GET', path: '/api/status' }), /Kibana API error 304/)
    assert.equal(hops.length, 1)
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

  it('wraps a text/yaml body in a YamlResponse (#588)', async () => {
    const client = makeClient()
    const yaml = 'kind: ConfigMap\n'
    client._testSetFetch(rawFetch(yaml, 'text/yaml'))

    const result = await client.request({ method: 'GET', path: '/api/fleet/kubernetes/download' })
    assert.ok(result instanceof YamlResponse)
    assert.equal(result.text, yaml)
  })

  it('parses application/x-ndjson into an array of objects (#588)', async () => {
    const client = makeClient()
    const ndjson = '{"list_id":"a","value":"1"}\n{"list_id":"a","value":"2"}\n'
    client._testSetFetch(rawFetch(ndjson, 'application/x-ndjson'))

    const result = await client.request({ method: 'POST', path: '/api/lists/items/_export' })
    assert.deepEqual(result, [
      { list_id: 'a', value: '1' },
      { list_id: 'a', value: '2' },
    ])
  })

  it('keeps non-JSON ndjson lines as strings (lists export is value per line)', async () => {
    const client = makeClient()
    const ndjson = '127.0.0.1\n127.0.0.2\n'
    client._testSetFetch(rawFetch(ndjson, 'application/ndjson'))

    const result = await client.request({ method: 'POST', path: '/api/lists/items/_export' }, 'ndjson')
    assert.deepEqual(result, ['127.0.0.1', '127.0.0.2'])
  })

  it('keeps a dotted IP as a string, not a failed JSON number', async () => {
    const client = makeClient()
    client._testSetFetch(rawFetch('192.0.2.1\n', 'application/x-ndjson'))

    const result = await client.request({ method: 'POST', path: '/api/lists/items/_export' }, 'ndjson')
    assert.deepEqual(result, ['192.0.2.1'])
  })

  it('decodes ndjson when Content-Type is application/json but responseType is ndjson (#588)', async () => {
    const client = makeClient()
    const ndjson = '{"list_id":"a"}\n{"list_id":"b"}\n'
    client._testSetFetch(rawFetch(ndjson, 'application/json'))

    const result = await client.request({ method: 'POST', path: '/api/lists/items/_export' }, 'ndjson')
    assert.deepEqual(result, [{ list_id: 'a' }, { list_id: 'b' }])
  })

  it('returns a yaml body advertised as application/json as raw text (#588)', async () => {
    const client = makeClient()
    const yaml = 'apiVersion: v1\nkind: ConfigMap\n'
    client._testSetFetch(rawFetch(yaml, 'application/json'))

    const result = await client.request({ method: 'GET', path: '/api/fleet/kubernetes/download' })
    assert.equal(result, yaml)
  })

  it('sends Accept: application/x-ndjson when responseType is ndjson', async () => {
    const client = makeClient()
    let captured: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>
      return Promise.resolve(new Response('{"id":"1"}\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } }))
    }) as typeof fetch)

    await client.request({ method: 'POST', path: '/api/lists/items/_export' }, 'ndjson')
    assert.equal(captured['Accept'], 'application/x-ndjson')
  })

  it('wraps a single NDJSON value in an array', async () => {
    const client = makeClient()
    client._testSetFetch(rawFetch('{"id":"1"}', 'application/x-ndjson'))

    const result = await client.request({ method: 'POST', path: '/api/lists/items/_export' })
    assert.deepEqual(result, [{ id: '1' }])
  })

  it('sends Accept: text/plain and returns raw text when responseType is text', async () => {
    const client = makeClient()
    let captured: Record<string, string> = {}
    client._testSetFetch(((url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>
      return Promise.resolve(new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }))
    }) as typeof fetch)

    const result = await client.request({ method: 'GET', path: '/api/status' }, 'text')
    assert.equal(captured['Accept'], 'text/plain')
    assert.equal(result, '{"a":1}')
  })

  it('returns a raw JavaScript body verbatim (oauth callback script)', async () => {
    const client = makeClient()
    const js = '(() => { window.location = "/" })()'
    client._testSetFetch(rawFetch(js, 'text/javascript'))

    const result = await client.request({ method: 'GET', path: '/oauth/callback' })
    assert.equal(result, js)
  })
})
