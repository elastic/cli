/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Behaviour every HTTP client shares. Per-product quirks live in each client's own test file.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EsClient } from '../../src/lib/es-client.ts'
import { KibanaClient } from '../../src/lib/kibana-client.ts'
import { CloudClient } from '../../src/lib/cloud-client.ts'
import { ConnectionError, HttpResponseError } from '../../src/lib/http-errors.ts'
import { clientHeaders } from '../../src/lib/meta.ts'

interface ContractRequest {
  method: 'GET' | 'POST'
  path: string
  querystring?: Record<string, string>
}

interface ContractClient {
  readonly baseUrl: string
  request (params: ContractRequest): Promise<unknown>
  _testSetFetch (fn: typeof fetch): void
}

interface ClientCase {
  name: string
  redirect: RequestRedirect
  make: (url: string) => ContractClient
}

interface Call {
  url: string
  init: RequestInit
}

const cases: ClientCase[] = [
  { name: 'EsClient', redirect: 'error', make: (url) => new EsClient(url, { api_key: 'k' }) },
  { name: 'KibanaClient', redirect: 'manual', make: (url) => new KibanaClient(url, { api_key: 'k' }) },
  { name: 'CloudClient', redirect: 'error', make: (url) => new CloudClient(url, 'k') },
]

/** Builds a client whose fetch records each call and answers with `response()`. */
function stub (c: ClientCase, url = 'https://example.com', response = () => new Response('{}', { status: 200 })) {
  const client = c.make(url)
  const calls: Call[] = []
  client._testSetFetch((async (u: string, init: RequestInit) => {
    calls.push({ url: u, init })
    return response()
  }) as typeof fetch)
  return { client, calls }
}

/** Runs `fn` and returns everything it wrote to stderr. */
function captureStderr (fn: () => void): string {
  const chunks: string[] = []
  const orig = process.stderr.write
  process.stderr.write = ((chunk: string) => { chunks.push(chunk); return true }) as typeof process.stderr.write
  try {
    fn()
  } finally {
    process.stderr.write = orig
  }
  return chunks.join('')
}

for (const c of cases) {
  describe(`${c.name} HTTP contract`, () => {
    describe('URL building', () => {
      it('appends the path to the base URL without its trailing slashes', async () => {
        const { client, calls } = stub(c, 'https://example.com:9243/prefix//')
        await client.request({ method: 'GET', path: '/a/b' })
        assert.equal(client.baseUrl, 'https://example.com:9243/prefix')
        assert.equal(calls[0]!.url, 'https://example.com:9243/prefix/a/b')
      })

      it('percent-encodes querystring keys and values', async () => {
        const { client, calls } = stub(c)
        await client.request({ method: 'GET', path: '/x', querystring: { 'a b': 'c d&e=f?#/../', n: '1' } })
        assert.equal(calls[0]!.url, 'https://example.com/x?a%20b=c%20d%26e%3Df%3F%23%2F..%2F&n=1')
      })

      it('leaves out ? for an empty querystring', async () => {
        const { client, calls } = stub(c)
        await client.request({ method: 'GET', path: '/x', querystring: {} })
        assert.equal(calls[0]!.url, 'https://example.com/x')
      })
    })

    describe('plaintext warning', () => {
      for (const url of ['http://remote.example.com', 'http://localhost.evil.com:9200']) {
        it(`warns for ${url}`, () => {
          assert.match(captureStderr(() => c.make(url)), /plaintext HTTP/)
        })
      }

      for (const url of ['https://remote.example.com', 'http://localhost:9200', 'http://127.0.0.1:9200', 'http://[::1]:9200']) {
        it(`does not warn for ${url}`, () => {
          assert.equal(captureStderr(() => c.make(url)), '')
        })
      }
    })

    describe('RequestInit', () => {
      it('pins method, redirect, and the client meta headers', async () => {
        const { client, calls } = stub(c)
        await client.request({ method: 'GET', path: '/x' })
        const { init } = calls[0]!
        assert.equal(init.method, 'GET')
        assert.equal(init.redirect, c.redirect)
        const headers = init.headers as Record<string, string>
        for (const [key, value] of Object.entries(clientHeaders())) assert.equal(headers[key], value)
        assert.equal(headers['Authorization'], 'ApiKey k')
        assert.equal(headers['Accept'], 'application/json')
      })
    })

    describe('errors', () => {
      it('wraps a fetch rejection in ConnectionError', async () => {
        const client = c.make('https://example.com')
        client._testSetFetch((() => Promise.reject(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND example.com') }))) as typeof fetch)
        await assert.rejects(client.request({ method: 'GET', path: '/x' }), (err: unknown) => {
          assert.ok(err instanceof ConnectionError)
          assert.equal(err.message, 'fetch failed: getaddrinfo ENOTFOUND example.com')
          return true
        })
      })

      it('throws HttpResponseError with the status on a non-2xx response', async () => {
        const { client } = stub(c, undefined, () => new Response('boom', { status: 500 }))
        await assert.rejects(client.request({ method: 'GET', path: '/x' }), (err: unknown) => {
          assert.ok(err instanceof HttpResponseError)
          assert.equal(err.statusCode, 500)
          assert.equal(err.body, 'boom')
          return true
        })
      })
    })
  })
}
