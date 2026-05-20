/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkElasticsearch,
  checkKibana,
  checkCloud,
} from '../../src/status/checks.ts'

type FetchCall = { url: string; init: RequestInit }

function recordingFetch (responder: (url: string) => Response | Promise<Response> | Error): {
  fetch: typeof fetch
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    calls.push({ url: urlStr, init: init ?? {} })
    const r = await responder(urlStr)
    if (r instanceof Error) throw r
    return r
  }) as unknown as typeof fetch
  return { fetch: fetchFn, calls }
}

describe('checkElasticsearch', () => {
  it('returns ok with status and node count on a healthy cluster', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify({ status: 'green', number_of_nodes: 3 }), { status: 200 })
    )
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: true, url: 'http://localhost:9200', status: 'green', nodes: 3 })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, 'http://localhost:9200/_cluster/health')
    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], 'ApiKey k')
    assert.equal(headers['Accept'], 'application/json')
    assert.equal(calls[0]!.init.redirect, 'error')
    assert.equal(calls[0]!.init.method, 'GET')
  })

  it('strips trailing slashes from the URL', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify({ status: 'yellow', number_of_nodes: 1 }), { status: 200 })
    )
    await checkElasticsearch({ url: 'http://localhost:9200///', auth: { api_key: 'k' } }, fetchFn)
    assert.equal(calls[0]!.url, 'http://localhost:9200/_cluster/health')
  })

  it('uses Basic auth when given username/password', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify({ status: 'green', number_of_nodes: 1 }), { status: 200 })
    )
    await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
      fetchFn,
    )
    const headers = calls[0]!.init.headers as Record<string, string>
    const expected = `Basic ${Buffer.from('elastic:changeme').toString('base64')}`
    assert.equal(headers['Authorization'], expected)
  })

  it('omits Authorization header when no auth is configured', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify({ status: 'green', number_of_nodes: 1 }), { status: 200 })
    )
    await checkElasticsearch({ url: 'http://localhost:9200' }, fetchFn)
    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], undefined)
  })

  it('classifies 401 as auth failed', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('nope', { status: 401 }))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'bad' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'auth failed (401)' })
  })

  it('classifies 403 as auth failed', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('forbidden', { status: 403 }))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'bad' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'auth failed (403)' })
  })

  it('classifies non-auth HTTP errors with the status code', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('boom', { status: 503 }))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'request failed (503)' })
  })

  it('reports network errors with the underlying message', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Error('ECONNREFUSED 9200'))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.error.startsWith('network error: '), `got ${result.error}`)
      assert.ok(result.error.includes('ECONNREFUSED'), `got ${result.error}`)
    }
  })

  it('reports unexpected response when body shape is wrong', async () => {
    const { fetch: fetchFn } = recordingFetch(() =>
      new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 })
    )
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'unexpected response' })
  })

  it('reports unexpected response when body is not JSON', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('<html>', { status: 200 }))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'unexpected response' })
  })

  it('reports unexpected response when body is a JSON primitive', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('null', { status: 200 }))
    const result = await checkElasticsearch(
      { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:9200', error: 'unexpected response' })
  })

})

describe('checkKibana', () => {
  it('returns ok with overall level and version on a healthy Kibana', async () => {
    const body = {
      status: { overall: { level: 'available' } },
      version: { number: '8.18.0' },
    }
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify(body), { status: 200 })
    )
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, {
      ok: true,
      url: 'http://localhost:5601',
      status: 'available',
      version: '8.18.0',
    })
    assert.equal(calls[0]!.url, 'http://localhost:5601/api/status')
  })

  it('classifies 401 as auth failed', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('nope', { status: 401 }))
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'bad' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'auth failed (401)' })
  })

  it('reports unexpected response when status.overall.level is missing', async () => {
    const { fetch: fetchFn } = recordingFetch(() =>
      new Response(JSON.stringify({ status: {}, version: { number: '8.18.0' } }), { status: 200 })
    )
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'unexpected response' })
  })

  it('reports unexpected response when version.number is missing', async () => {
    const { fetch: fetchFn } = recordingFetch(() =>
      new Response(JSON.stringify({ status: { overall: { level: 'available' } }, version: {} }), { status: 200 })
    )
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'unexpected response' })
  })

  it('reports unexpected response when top-level fields are absent', async () => {
    const { fetch: fetchFn } = recordingFetch(() =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'unexpected response' })
  })

  it('reports unexpected response when body is not an object', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('"plain"', { status: 200 }))
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'unexpected response' })
  })

  it('reports unexpected response when status.overall is missing', async () => {
    const { fetch: fetchFn } = recordingFetch(() =>
      new Response(JSON.stringify({ status: { other: 1 }, version: { number: '8.18.0' } }), { status: 200 })
    )
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: false, url: 'http://localhost:5601', error: 'unexpected response' })
  })

  it('reports network errors', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Error('getaddrinfo ENOTFOUND'))
    const result = await checkKibana(
      { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.error.includes('network error'), `got ${result.error}`)
    }
  })
})

describe('checkCloud', () => {
  it('returns ok when auth is an api_key and the request succeeds', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() =>
      new Response(JSON.stringify({ user_id: 'me' }), { status: 200 })
    )
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: true, url: 'https://api.elastic-cloud.com' })
    assert.equal(calls[0]!.url, 'https://api.elastic-cloud.com/api/v1/user')
    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], 'ApiKey k')
  })

  it('rejects basic auth without making a request', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() => {
      throw new Error('should not be called')
    })
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { username: 'a', password: 'b' } },
      fetchFn,
    )
    assert.deepEqual(result, {
      ok: false,
      url: 'https://api.elastic-cloud.com',
      error: 'cloud requires api_key auth',
    })
    assert.equal(calls.length, 0)
  })

  it('rejects missing auth without making a request', async () => {
    const { fetch: fetchFn, calls } = recordingFetch(() => {
      throw new Error('should not be called')
    })
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com' },
      fetchFn,
    )
    assert.deepEqual(result, {
      ok: false,
      url: 'https://api.elastic-cloud.com',
      error: 'cloud requires api_key auth',
    })
    assert.equal(calls.length, 0)
  })

  it('classifies 401 as auth failed', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('nope', { status: 401 }))
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { api_key: 'bad' } },
      fetchFn,
    )
    assert.deepEqual(result, {
      ok: false,
      url: 'https://api.elastic-cloud.com',
      error: 'auth failed (401)',
    })
  })

  it('reports network errors', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Error('ECONNRESET'))
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.error.includes('network error'), `got ${result.error}`)
    }
  })

  it('reports request failed for non-auth HTTP errors', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('oops', { status: 500 }))
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, {
      ok: false,
      url: 'https://api.elastic-cloud.com',
      error: 'request failed (500)',
    })
  })

  it('treats an empty response body as ok', async () => {
    const { fetch: fetchFn } = recordingFetch(() => new Response('', { status: 200 }))
    const result = await checkCloud(
      { url: 'https://api.elastic-cloud.com', auth: { api_key: 'k' } },
      fetchFn,
    )
    assert.deepEqual(result, { ok: true, url: 'https://api.elastic-cloud.com' })
  })
})
