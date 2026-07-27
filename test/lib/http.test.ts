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

  it('redacts credentials in JSON bodies and sensitive URL values', async () => {
    const responseBody = JSON.stringify({
      credentials: { username: 'elastic', password: 'response-secret' },
      access_token: 'access-secret',
      encoded: 'encoded-api-key',
      http_ca_key: 'ca-private-key',
      nodes_credentials: { token: 'node-secret' },
      secret_key: 'signing-secret',
      secret_parameters: { value: 'parameter-secret' },
      secure_settings_password: 'keystore-secret',
      transport_key: 'transport-private-key',
      status: 'ready',
    })
    const response = new Response(responseBody, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    let returnedBody = ''
    const { stderr } = await captureProcessOutput(async () => {
      const result = await apiFetch(
        (() => Promise.resolve(response)) as typeof fetch,
        'https://user:user-secret@api.elastic-cloud.com/api/v1/organizations/invitations/invite-secret?trace=true&access_token=query-secret&enrolToken=enrol-secret&state=state-secret&session_state=session-secret',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            access_key: 'aws-access-key',
            name: 'example',
            password: 'request-secret',
            nested: { api_key: 'nested-secret' },
            secrets: { client_secret: 'client-secret' },
            enrolToken: 'body-enrol-secret',
            langSmithApiKey: 'langsmith-secret',
            relay_state: 'relay-secret',
          }),
        },
        { debug: true }
      )
      returnedBody = await result.text()
    })

    assert.match(stderr, /> POST https:\/\/\(redacted\):\(redacted\)@api\.elastic-cloud\.com\/api\/v1\/organizations\/invitations\/\(redacted\)\?trace=true&access_token=\(redacted\)&enrolToken=\(redacted\)&state=\(redacted\)&session_state=\(redacted\)/)
    assert.match(stderr, /\{"access_key":"\(redacted\)","name":"example","password":"\(redacted\)","nested":\{"api_key":"\(redacted\)"\},"secrets":"\(redacted\)","enrolToken":"\(redacted\)","langSmithApiKey":"\(redacted\)","relay_state":"\(redacted\)"\}/)
    assert.match(stderr, /\{"credentials":"\(redacted\)","access_token":"\(redacted\)","encoded":"\(redacted\)","http_ca_key":"\(redacted\)","nodes_credentials":"\(redacted\)","secret_key":"\(redacted\)","secret_parameters":"\(redacted\)","secure_settings_password":"\(redacted\)","transport_key":"\(redacted\)","status":"ready"\}/)
    assert.doesNotMatch(stderr, /user-secret|invite-secret|query-secret|enrol-secret|state-secret|session-secret|aws-access-key|request-secret|nested-secret|client-secret|body-enrol-secret|langsmith-secret|relay-secret|response-secret|access-secret|encoded-api-key|ca-private-key|node-secret|signing-secret|parameter-secret|keystore-secret|transport-private-key/)
    assert.equal(returnedBody, responseBody, 'debug redaction must not alter the caller response')
  })

  it('preserves non-credential token fields in ordinary API responses', async () => {
    const responseBody = '{"tokens":[{"token":"quick","position":0}]}'
    const response = new Response(responseBody, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const { stderr } = await captureProcessOutput(() =>
      apiFetch(
        (() => Promise.resolve(response)) as typeof fetch,
        'https://example.test/_analyze',
        { method: 'POST' },
        { debug: true }
      )
    )

    assert.match(stderr, /\{"tokens":\[\{"token":"quick","position":0\}\]\}/)
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
