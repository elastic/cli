/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buildApiRequest, redactRequest, sendApiRequest, _testSetFetch } from '../../src/api/request.ts'
import { EsConnectionError, EsResponseError } from '../../src/lib/es-client.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { clientHeaders } from '../../src/lib/meta.ts'

const esConfig: ResolvedConfig = {
  context: { elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'secret-key' } } },
}

afterEach(() => {
  _testSetFetch(globalThis.fetch)
})

describe('buildApiRequest', () => {
  it('builds GET / against elasticsearch with auth and encoded path', () => {
    const req = buildApiRequest({
      method: 'get',
      path: '/',
      service: 'es',
      config: esConfig,
    })
    assert.equal(req.method, 'GET')
    assert.equal(req.url, 'http://localhost:9200/')
    assert.equal(req.redirect, 'error')
    assert.equal(req.headers['Authorization'], 'ApiKey secret-key')
    assert.equal(req.headers['x-elastic-client-meta'], clientHeaders()['x-elastic-client-meta'])
  })

  it('encodes path segments and query values', () => {
    const req = buildApiRequest({
      method: 'GET',
      path: '/foo bar/_doc/id?pretty=true',
      service: 'es',
      config: esConfig,
    })
    assert.equal(req.url, 'http://localhost:9200/foo%20bar/_doc/id?pretty=true')
  })

  it('rejects .. in the path', () => {
    assert.throws(
      () => buildApiRequest({ method: 'GET', path: '/foo/../bar', service: 'es', config: esConfig }),
      /Invalid path/,
    )
  })

  it('rejects an unknown method or service', () => {
    assert.throws(
      () => buildApiRequest({ method: 'TRACE', path: '/', service: 'es', config: esConfig }),
      /method must be/,
    )
    assert.throws(
      () => buildApiRequest({ method: 'GET', path: '/', service: 'fleet', config: esConfig }),
      /service must be es, kb, or cloud/,
    )
  })

  it('throws missing_config when the service block is absent', () => {
    assert.throws(
      () => buildApiRequest({ method: 'GET', path: '/', service: 'es', config: { context: {} } }),
      /missing_config: No Elasticsearch/,
    )
    assert.throws(
      () => buildApiRequest({ method: 'GET', path: '/', service: 'kb', config: esConfig }),
      /missing_config: No Kibana/,
    )
    assert.throws(
      () => buildApiRequest({ method: 'GET', path: '/', service: 'cloud', config: esConfig }),
      /missing_config: No Cloud/,
    )
  })

  it('builds a Cloud request with an api_key', () => {
    const req = buildApiRequest({
      method: 'GET',
      path: '/api/v1/serverless/projects',
      service: 'cloud',
      config: { context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'ck' } } } },
    })
    assert.equal(req.url, 'https://api.elastic-cloud.com/api/v1/serverless/projects')
    assert.equal(req.headers['Authorization'], 'ApiKey ck')
    assert.equal(req.redirect, 'error')
  })

  it('sends a string body as-is', () => {
    const req = buildApiRequest({
      method: 'POST',
      path: '/_bulk',
      service: 'es',
      body: '{"index":{}}\n{"a":1}\n',
      config: esConfig,
    })
    assert.equal(req.body, '{"index":{}}\n{"a":1}\n')
  })

  it('requires a cloud api_key', () => {
    assert.throws(
      () => buildApiRequest({
        method: 'GET',
        path: '/api/v1/serverless/projects',
        service: 'cloud',
        config: { context: { cloud: { url: 'https://api.elastic-cloud.com', auth: { username: 'u', password: 'p' } } } },
      }),
      /Cloud auth requires an api_key/,
    )
  })

  it('sets kbn-xsrf on mutating Kibana requests', () => {
    const config: ResolvedConfig = {
      context: { kibana: { url: 'http://localhost:5601', auth: { api_key: 'k' } } },
    }
    const post = buildApiRequest({ method: 'POST', path: '/api/status', service: 'kb', config })
    assert.equal(post.headers['kbn-xsrf'], 'true')
    const get = buildApiRequest({ method: 'GET', path: '/api/status', service: 'kb', config })
    assert.equal(get.headers['kbn-xsrf'], undefined)
  })

  it('applies extra headers and JSON body', () => {
    const req = buildApiRequest({
      method: 'POST',
      path: '/idx/_doc',
      service: 'es',
      extraHeaders: ['X-Opaque-Id: job-1', 'Content-Type: application/json'],
      body: { name: 'Alice' },
      config: esConfig,
    })
    assert.equal(req.headers['X-Opaque-Id'], 'job-1')
    assert.equal(req.body, JSON.stringify({ name: 'Alice' }))
    assert.equal(req.headers['Content-Type'], 'application/json')
  })

  it('rejects a header without a name', () => {
    assert.throws(
      () => buildApiRequest({
        method: 'GET',
        path: '/',
        service: 'es',
        extraHeaders: [': value'],
        config: esConfig,
      }),
      /invalid header/,
    )
  })

  it('warns on plaintext HTTP to a non-loopback host', () => {
    const writes: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: unknown) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    }) as typeof process.stderr.write
    try {
      buildApiRequest({
        method: 'GET',
        path: '/',
        service: 'es',
        config: { context: { elasticsearch: { url: 'http://example.com:9200', auth: { api_key: 'k' } } } },
      })
    } finally {
      process.stderr.write = orig
    }
    assert.ok(writes.some((w) => w.includes('plaintext HTTP')))
  })

  it('redacts Authorization on dry-run output', () => {
    const req = buildApiRequest({ method: 'GET', path: '/', service: 'es', config: esConfig })
    const redacted = redactRequest(req)
    assert.equal(redacted.headers['Authorization'], 'ApiKey ***')
    assert.equal(req.headers['Authorization'], 'ApiKey secret-key')
  })
})

describe('sendApiRequest', () => {
  it('sends redirect:error and returns cluster info', async () => {
    let capturedInit: RequestInit = {}
    let capturedUrl = ''
    const restore = _testSetFetch(((url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init ?? {}
      return Promise.resolve(new Response(JSON.stringify({ name: 'n1', cluster_name: 'c' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'GET', path: '/', service: 'es', config: esConfig })
      const result = await sendApiRequest(req)
      assert.equal(capturedUrl, 'http://localhost:9200/')
      assert.equal(capturedInit.method, 'GET')
      assert.equal(capturedInit.redirect, 'error')
      assert.deepEqual(result, { name: 'n1', cluster_name: 'c' })
      const headers = capturedInit.headers as Record<string, string>
      assert.equal(headers['Authorization'], 'ApiKey secret-key')
    } finally {
      restore()
    }
  })

  it('throws EsResponseError on 401 and 404', async () => {
    const restore = _testSetFetch((() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
    ) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'GET', path: '/', service: 'es', config: esConfig })
      await assert.rejects(() => sendApiRequest(req), (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 401)
        return true
      })
    } finally {
      restore()
    }
  })

  it('throws EsConnectionError when fetch fails', async () => {
    const restore = _testSetFetch((() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'GET', path: '/', service: 'es', config: esConfig })
      await assert.rejects(() => sendApiRequest(req), (err: unknown) => {
        assert.ok(err instanceof EsConnectionError)
        assert.match(err.message, /fetch failed/)
        return true
      })
    } finally {
      restore()
    }
  })

  it('returns {} for an empty 200 body', async () => {
    const restore = _testSetFetch((() => Promise.resolve(new Response('', { status: 200 }))) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'DELETE', path: '/idx', service: 'es', config: esConfig })
      assert.deepEqual(await sendApiRequest(req), {})
    } finally {
      restore()
    }
  })

  it('HEAD returns true on 200 and false on 404', async () => {
    const restore200 = _testSetFetch((() => Promise.resolve(new Response('', { status: 200 }))) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'HEAD', path: '/idx', service: 'es', config: esConfig })
      assert.equal(await sendApiRequest(req), true)
    } finally {
      restore200()
    }
    const restore404 = _testSetFetch((() => Promise.resolve(new Response('', { status: 404 }))) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'HEAD', path: '/idx', service: 'es', config: esConfig })
      assert.equal(await sendApiRequest(req), false)
    } finally {
      restore404()
    }
  })

  it('returns a raw string when the body is not JSON', async () => {
    const restore = _testSetFetch((() =>
      Promise.resolve(new Response('index health\n', { status: 200, headers: { 'content-type': 'text/plain' } }))
    ) as typeof fetch)
    try {
      const req = buildApiRequest({ method: 'GET', path: '/_cat/indices', service: 'es', config: esConfig })
      assert.equal(await sendApiRequest(req), 'index health\n')
    } finally {
      restore()
    }
  })
})
