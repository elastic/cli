/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Behaviour every HTTP client shares. Per-product quirks live in each client's own test file.

import { afterEach, describe, it, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EsClient } from '../../src/lib/es-client.ts'
import { KibanaClient } from '../../src/lib/kibana-client.ts'
import { CloudClient } from '../../src/lib/cloud-client.ts'
import { ConnectionError, HttpResponseError } from '../../src/lib/http-errors.ts'
import { clientHeaders } from '../../src/lib/meta.ts'
import { setResolvedConfig, _testResetConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'
import { capture } from '../helpers/capture.ts'

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

/**
 * Replaces the request deadline with a controller the test fires, and records the requested ms.
 * The fake fetch answers with a body that errors on abort, as undici's does.
 */
function stubTimeout (t: TestContext, c: ClientCase, abortBefore: 'headers' | 'body') {
  const controller = new AbortController()
  const timeouts: number[] = []
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return controller.signal })
  const client = c.make('https://example.com')
  client._testSetFetch(((_url: string, init: RequestInit) => new Promise((resolve, reject) => {
    const signal = init.signal!
    if (abortBefore === 'headers') {
      signal.addEventListener('abort', () => reject(signal.reason))
      return
    }
    const body = new ReadableStream({ start: (ctrl) => signal.addEventListener('abort', () => ctrl.error(signal.reason)) })
    resolve(new Response(body, { status: 200 }))
  })) as typeof fetch)
  const fire = () => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  return { client, timeouts, fire }
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

      it('skips undefined values and leaves out ? when none remain', async () => {
        const { client, calls } = stub(c)
        const querystring = { a: undefined, b: '1' } as unknown as Record<string, string>
        await client.request({ method: 'GET', path: '/x', querystring })
        await client.request({ method: 'GET', path: '/x', querystring: { a: undefined } as unknown as Record<string, string> })
        assert.deepEqual(calls.map((call) => call.url), ['https://example.com/x?b=1', 'https://example.com/x'])
      })
    })

    describe('scheme rejection', () => {
      for (const url of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)']) {
        it(`rejects ${url} before sending`, async () => {
          const { client, calls } = stub(c, url)
          await assert.rejects(client.request({ method: 'GET', path: '/x' }), /Unsupported URL scheme/)
          assert.equal(calls.length, 0)
        })
      }
    })

    describe('plaintext warning', () => {
      for (const url of ['http://remote.example.com', 'http://localhost.evil.com:9200']) {
        it(`warns for ${url}`, (t) => {
          const { stderr } = capture(t)
          c.make(url)
          assert.match(stderr.join(''), /plaintext HTTP/)
        })
      }

      for (const url of ['https://remote.example.com', 'http://localhost:9200', 'http://127.0.0.1:9200', 'http://[::1]:9200']) {
        it(`does not warn for ${url}`, (t) => {
          const { stderr } = capture(t)
          c.make(url)
          assert.equal(stderr.join(''), '')
        })
      }
    })

    describe('RequestInit', () => {
      it('pins method, redirect, signal, and the client meta headers', async () => {
        const { client, calls } = stub(c)
        await client.request({ method: 'GET', path: '/x' })
        const { init } = calls[0]!
        assert.equal(init.method, 'GET')
        assert.equal(init.redirect, c.redirect)
        assert.ok(init.signal instanceof AbortSignal)
        assert.equal(init.signal.aborted, false)
        const headers = init.headers as Record<string, string>
        for (const [key, value] of Object.entries(clientHeaders())) assert.equal(headers[key], value)
        assert.equal(headers['Authorization'], 'ApiKey k')
        assert.equal(headers['Accept'], 'application/json')
      })
    })

    describe('x-elastic-client-meta', () => {
      // The RequestInit test compares against clientHeaders(), which passes vacuously when
      // telemetry is off; pin both states by name.
      const env = process.env.ELASTIC_CLI_TELEMETRY
      afterEach(() => {
        _testResetConfig()
        if (env === undefined) delete process.env.ELASTIC_CLI_TELEMETRY
        else process.env.ELASTIC_CLI_TELEMETRY = env
      })

      for (const method of ['GET', 'POST'] as const) {
        it(`is sent on a ${method} by default`, async () => {
          delete process.env.ELASTIC_CLI_TELEMETRY
          const { client, calls } = stub(c)
          await client.request({ method, path: '/x' })
          assert.match((calls[0]!.init.headers as Record<string, string>)['x-elastic-client-meta'] ?? '', /^et=[^,]+,js=[^,]+,t=/)
        })
      }

      it('is omitted when config telemetry is false', async () => {
        delete process.env.ELASTIC_CLI_TELEMETRY
        setResolvedConfig({ context: {}, telemetry: false } as ResolvedConfig)
        const { client, calls } = stub(c)
        await client.request({ method: 'GET', path: '/x' })
        const headers = calls[0]!.init.headers as Record<string, string>
        assert.equal('x-elastic-client-meta' in headers, false)
        assert.match(headers['user-agent'] ?? '', /^elastic-cli\//)
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

      for (const phase of ['headers', 'body'] as const) {
        it(`reports a timeout while awaiting the ${phase} as ConnectionError, with a 600000 ms deadline`, async (t) => {
          const { client, timeouts, fire } = stubTimeout(t, c, phase)
          const pending = client.request({ method: 'GET', path: '/x' })
          await new Promise((resolve) => setImmediate(resolve))
          fire()
          await assert.rejects(pending, (err: unknown) => {
            assert.ok(err instanceof ConnectionError, String(err))
            assert.equal(err.message, 'The operation was aborted due to timeout')
            return true
          })
          assert.deepEqual(timeouts, [600_000])
        })
      }

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
