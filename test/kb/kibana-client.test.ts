/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { KibanaClient, getKibanaClient, _testResetKibanaClient } from '../../src/lib/kibana-client.ts'
import { setResolvedConfig, _testResetConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

afterEach(() => {
  _testResetKibanaClient()
  _testResetConfig()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig (overrides: Partial<Parameters<typeof setResolvedConfig>[0]['context']> = {}): ResolvedConfig {
  return {
    context: {
      kibana: {
        url: 'https://kb.example.com',
        auth: { api_key: 'test-key' }
      },
      ...overrides
    }
  } as unknown as ResolvedConfig
}

/** Builds a minimal fetch stub that returns the given status and body */
function makeFetchStub (status: number, body: string): typeof fetch {
  return async () => new Response(body, { status })
}

/** Captures all requests made through KibanaClient */
function makeCapturingFetch (status = 200, body = '{}'): {
  fetch: typeof fetch
  calls: Array<{ url: string; init: RequestInit }>
} {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: url.toString(), init: init ?? {} })
    return new Response(body, { status })
  }
  return { fetch: fn as unknown as typeof fetch, calls }
}

// ---------------------------------------------------------------------------
// Constructor / auth header
// ---------------------------------------------------------------------------

describe('KibanaClient -- no auth', () => {
  it('omits Authorization header when no auth is provided', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com')
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Authorization'], undefined)
  })
})

describe('KibanaClient -- API key auth', () => {
  it('sets Authorization header to ApiKey <key>', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'my-key' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Authorization'], 'ApiKey my-key')
  })
})

describe('KibanaClient -- basic auth', () => {
  it('sets Authorization header to Basic <base64>', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { username: 'elastic', password: 'changeme' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    const expected = `Basic ${Buffer.from('elastic:changeme').toString('base64')}`
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Authorization'], expected)
  })
})

// ---------------------------------------------------------------------------
// kbn-xsrf header
// ---------------------------------------------------------------------------

describe('KibanaClient -- kbn-xsrf header', () => {
  it('adds kbn-xsrf: true for POST', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'POST', path: '/api/saved_objects/lens' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['kbn-xsrf'], 'true')
  })

  it('adds kbn-xsrf: true for PUT', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'PUT', path: '/api/saved_objects/lens/abc' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['kbn-xsrf'], 'true')
  })

  it('adds kbn-xsrf: true for DELETE', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'DELETE', path: '/api/saved_objects/lens/abc' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['kbn-xsrf'], 'true')
  })

  it('does NOT add kbn-xsrf for GET', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['kbn-xsrf'], undefined)
  })

  it('does NOT add kbn-xsrf for HEAD', async () => {
    const { fetch, calls } = makeCapturingFetch(200, '')
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'HEAD', path: '/api/status' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['kbn-xsrf'], undefined)
  })
})

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe('KibanaClient -- URL construction', () => {
  it('appends path to baseUrl', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/saved_objects/_find' })
    assert.equal(calls[0]!.url, 'https://kb.example.com/api/saved_objects/_find')
  })

  it('strips trailing slash from baseUrl before appending path', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com/', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(calls[0]!.url, 'https://kb.example.com/api/status')
  })

  it('appends querystring when present', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/saved_objects/_find', querystring: { type: 'lens', per_page: 20 } })
    const url = new URL(calls[0]!.url)
    assert.equal(url.searchParams.get('type'), 'lens')
    assert.equal(url.searchParams.get('per_page'), '20')
  })

  it('does not append ? when querystring is empty', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status', querystring: {} })
    assert.ok(!calls[0]!.url.includes('?'))
  })
})

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

describe('KibanaClient -- request body', () => {
  it('serializes body as JSON', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'POST', path: '/api/saved_objects/lens', body: { attributes: { title: 'My Lens' } } })
    assert.equal(calls[0]!.init.body, JSON.stringify({ attributes: { title: 'My Lens' } }))
  })

  it('does not include body key when body is undefined', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'GET', path: '/api/status' })
    assert.equal(calls[0]!.init.body, undefined)
  })
})

// ---------------------------------------------------------------------------
// multipartFields -- file upload
// ---------------------------------------------------------------------------

describe('KibanaClient -- multipartFields', () => {
  it('sends a FormData body without setting Content-Type manually', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'POST', path: '/api/saved_objects/_import', multipartFields: { file: 'nonexistent.ndjson' } })
    assert.ok(calls[0]!.init.body instanceof FormData)
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Content-Type'], undefined)
  })

  it('appends a literal string field when the value does not resolve to a file', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'POST', path: '/api/saved_objects/_import', multipartFields: { overwrite: 'true' } })
    const form = calls[0]!.init.body as FormData
    assert.equal(form.get('overwrite'), 'true')
  })

  it('reads file contents and sends them as a named Blob when the value resolves to an existing file', async () => {
    const tmpFile = path.join(os.tmpdir(), `kibana-client-test-${Date.now()}.ndjson`)
    fs.writeFileSync(tmpFile, '{"type":"index-pattern"}\n')
    try {
      const { fetch, calls } = makeCapturingFetch()
      const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
      client._testSetFetch(fetch)
      await client.request({ method: 'POST', path: '/api/saved_objects/_import', multipartFields: { file: tmpFile } })
      const form = calls[0]!.init.body as FormData
      const entry = form.get('file') as File
      assert.equal(entry.name, path.basename(tmpFile))
      assert.equal(await entry.text(), '{"type":"index-pattern"}\n')
    } finally {
      fs.rmSync(tmpFile)
    }
  })

  it('treats a directory at the given path as a literal string instead of crashing on EISDIR', async () => {
    const { fetch, calls } = makeCapturingFetch()
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(fetch)
    await client.request({ method: 'POST', path: '/api/saved_objects/_import', multipartFields: { file: os.tmpdir() } })
    const form = calls[0]!.init.body as FormData
    assert.equal(form.get('file'), os.tmpdir())
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('KibanaClient -- error responses', () => {
  it('throws on non-2xx response', async () => {
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(makeFetchStub(404, '{"statusCode":404,"error":"Not Found"}'))
    await assert.rejects(
      () => client.request({ method: 'GET', path: '/api/saved_objects/lens/missing' }),
      (err: Error) => {
        assert.ok(err.message.includes('404'))
        return true
      }
    )
  })

  it('returns empty object for empty 2xx body', async () => {
    const client = new KibanaClient('https://kb.example.com', { api_key: 'k' })
    client._testSetFetch(makeFetchStub(200, ''))
    const result = await client.request({ method: 'DELETE', path: '/api/saved_objects/lens/abc' })
    assert.deepEqual(result, {})
  })
})

// ---------------------------------------------------------------------------
// getKibanaClient -- factory
// ---------------------------------------------------------------------------

describe('getKibanaClient', () => {
  it('throws missing_config when no kibana block is configured', () => {
    setResolvedConfig({ context: { elasticsearch: { url: 'https://es.example.com', auth: { api_key: 'k' } } } } as unknown as ResolvedConfig)
    assert.throws(
      () => getKibanaClient(),
      (err: Error) => {
        assert.ok(err.message.includes('missing_config'))
        return true
      }
    )
  })

  it('returns an unauthenticated client when auth block is empty or absent', () => {
    setResolvedConfig(makeConfig({ kibana: { url: 'https://kb.example.com', auth: {} as never } }))
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
    assert.equal(client.baseUrl, 'https://kb.example.com')
  })

  it('returns a KibanaClient instance configured with api_key auth', () => {
    setResolvedConfig(makeConfig())
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
    assert.equal(client.baseUrl, 'https://kb.example.com')
  })

  it('returns a KibanaClient instance configured with basic auth', () => {
    setResolvedConfig(makeConfig({ kibana: { url: 'https://kb.example.com', auth: { username: 'elastic', password: 'changeme' } } }))
    const client = getKibanaClient()
    assert.ok(client instanceof KibanaClient)
  })

  it('returns the same cached instance on repeated calls', () => {
    setResolvedConfig(makeConfig())
    const first = getKibanaClient()
    const second = getKibanaClient()
    assert.equal(first, second)
  })
})
