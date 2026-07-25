/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  apiFetch,
  attachHttpDebug,
  isHttpDebugEnabled,
  setHttpDebugEnabled,
  setHttpDebugJsonMode,
} from '../../src/lib/http.ts'
import { captureProcessOutput } from '../support/capture-output.ts'

const originalElasticDebug = process.env['ELASTIC_DEBUG']

afterEach(() => {
  setHttpDebugEnabled(false)
  setHttpDebugJsonMode(false)
  attachHttpDebug(null)
  if (originalElasticDebug === undefined) {
    delete process.env['ELASTIC_DEBUG']
  } else {
    process.env['ELASTIC_DEBUG'] = originalElasticDebug
  }
})

describe('HTTP debug activation', () => {
  it('is disabled by default', () => {
    delete process.env['ELASTIC_DEBUG']
    assert.equal(isHttpDebugEnabled(), false)
  })

  it('is enabled only for ELASTIC_DEBUG=1', () => {
    process.env['ELASTIC_DEBUG'] = 'true'
    assert.equal(isHttpDebugEnabled(), false)
    process.env['ELASTIC_DEBUG'] = '1'
    assert.equal(isHttpDebugEnabled(), true)
  })

  it('allows the CLI flag to enable debugging independently of the environment', () => {
    process.env['ELASTIC_DEBUG'] = '0'
    setHttpDebugEnabled(true)
    assert.equal(isHttpDebugEnabled(), true)
  })
})

describe('apiFetch', () => {
  it('delegates without writing output when debugging is disabled', async () => {
    delete process.env['ELASTIC_DEBUG']
    let receivedInit: RequestInit | undefined
    const response = new Response('ok', { status: 200 })
    const fakeFetch = ((url: string, init: RequestInit) => {
      assert.equal(url, 'https://example.test/data')
      receivedInit = init
      return Promise.resolve(response)
    }) as typeof fetch

    const output = await captureProcessOutput(async () => {
      const result = await apiFetch(
        fakeFetch,
        'https://example.test/data',
        { method: 'GET' },
        { debug: false }
      )
      assert.strictEqual(result, response)
    })

    assert.deepEqual(receivedInit, { method: 'GET' })
    assert.deepEqual(output, { stdout: '', stderr: '' })
  })

  it('logs request and response details while redacting credential headers', async () => {
    setHttpDebugEnabled(true)
    const response = new Response('{"ok":true}', {
      status: 201,
      statusText: 'Created',
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'session=response-secret',
      },
    })
    const fakeFetch = (() => Promise.resolve(response)) as typeof fetch

    let returnedBody = ''
    const output = await captureProcessOutput(async () => {
      const result = await apiFetch(
        fakeFetch,
        'https://example.test/_search',
        {
          method: 'POST',
          headers: {
            Authorization: 'ApiKey request-secret',
            'Proxy-Authorization': 'Basic proxy-secret',
            'x-API-key': 'second-secret',
            Cookie: 'session=cookie-secret',
            Accept: 'application/json',
          },
          body: '{"query":{"match_all":{}}}',
        },
        { debug: true }
      )
      returnedBody = await result.text()
    })

    assert.equal(output.stdout, '')
    assert.match(output.stderr, /> POST https:\/\/example\.test\/_search/)
    assert.match(output.stderr, /> authorization: \(redacted\)/)
    assert.match(output.stderr, /> proxy-authorization: \(redacted\)/)
    assert.match(output.stderr, /> x-api-key: \(redacted\)/)
    assert.match(output.stderr, /> cookie: \(redacted\)/)
    assert.match(output.stderr, /> accept: application\/json/)
    assert.match(output.stderr, /\{"query":\{"match_all":\{\}\}\}/)
    assert.match(output.stderr, /< 201 Created/)
    assert.match(output.stderr, /< content-type: application\/json/)
    assert.match(output.stderr, /< set-cookie: \(redacted\)/)
    assert.match(output.stderr, /\{"ok":true\}/)
    assert.doesNotMatch(output.stderr, /request-secret|proxy-secret|second-secret|cookie-secret|response-secret/)
    assert.equal(returnedBody, '{"ok":true}', 'debug logging must not consume the caller response')
  })

  it('logs requests without bodies and responses with empty bodies', async () => {
    setHttpDebugEnabled(true)
    const fakeFetch = (() => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch

    const { stderr } = await captureProcessOutput(async () => {
      await apiFetch(
        fakeFetch,
        'https://example.test/empty',
        {
          method: 'HEAD',
          headers: new Headers({ Accept: 'application/json' }),
        },
        { debug: true }
      )
    })

    assert.match(stderr, /> HEAD https:\/\/example\.test\/empty/)
    assert.match(stderr, /< 204/)
  })

  it('logs network failures and preserves the original error', async () => {
    setHttpDebugEnabled(true)
    const failure = new TypeError('connection refused')
    const fakeFetch = (() => Promise.reject(failure)) as typeof fetch

    const { stderr } = await captureProcessOutput(async () => {
      await assert.rejects(
        () => apiFetch(fakeFetch, 'https://example.test/fail', { method: 'GET' }, { debug: true }),
        (error: unknown) => error === failure
      )
    })

    assert.match(stderr, /> GET https:\/\/example\.test\/fail/)
    assert.match(stderr, /< Request failed: .*connection refused/)
  })

  it('does not let an unreadable debug copy break the caller response', async () => {
    setHttpDebugEnabled(true)
    const response = new Response('caller can still read this', { status: 200 })
    Object.defineProperty(response, 'clone', {
      value: () => { throw new Error('clone unavailable') },
    })
    const fakeFetch = (() => Promise.resolve(response)) as typeof fetch

    const { stderr } = await captureProcessOutput(async () => {
      const result = await apiFetch(
        fakeFetch,
        'https://example.test/data',
        {
          method: 'GET',
          headers: [['X-Test', 'value']],
        },
        { debug: true }
      )
      assert.equal(await result.text(), 'caller can still read this')
    })

    assert.match(stderr, /< Response body unavailable: .*clone unavailable/)
  })

  it('redacts credential-bearing response headers', async () => {
    const response = new Response(null, {
      status: 401,
      headers: {
        'authentication-info': 'nextnonce=response-secret',
        'proxy-authenticate': 'Basic realm="proxy-secret"',
        'www-authenticate': 'ApiKey realm="request-secret"',
      },
    })

    const { stderr } = await captureProcessOutput(() =>
      apiFetch(
        (() => Promise.resolve(response)) as typeof fetch,
        'https://example.test/private',
        { method: 'GET' },
        { debug: true }
      )
    )

    assert.match(stderr, /< authentication-info: \(redacted\)/)
    assert.match(stderr, /< proxy-authenticate: \(redacted\)/)
    assert.match(stderr, /< www-authenticate: \(redacted\)/)
    assert.doesNotMatch(stderr, /response-secret|proxy-secret|request-secret/)
  })

  it('buffers debug statements into one JSON-compatible result', async () => {
    setHttpDebugJsonMode(true)
    const response = new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const output = await captureProcessOutput(() =>
      apiFetch(
        (() => Promise.resolve(response)) as typeof fetch,
        'https://example.test/data',
        { method: 'GET' },
        { debug: true }
      )
    )
    const result = attachHttpDebug({ ok: true })

    assert.deepEqual(output, { stdout: '', stderr: '' })
    assert.deepEqual(result, {
      ok: true,
      debug: [
        '> GET https://example.test/data',
        '< 200',
        '< content-type: application/json',
        '{"ok":true}',
      ],
    })
    assert.deepEqual(attachHttpDebug({ next: true }), { next: true }, 'attaching drains the buffer')
  })
})
