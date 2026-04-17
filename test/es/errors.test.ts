/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { errors } from '@elastic/transport'
import { transportError, missingConfigError } from '../../src/es/errors.ts'

function makeDiagnosticMeta (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    body: null,
    statusCode: 0,
    headers: {},
    meta: {
      context: null,
      request: { params: {}, options: {}, id: 0 },
      name: 'test',
      connection: null,
      attempts: 0,
      aborted: false,
    },
    warnings: null,
    ...overrides,
  }
}

describe('missingConfigError', () => {
  it('wraps an Error message in the expected shape', () => {
    const res = missingConfigError(new Error('no config found')) as { error: { code: string; message: string } }
    assert.equal(res.error.code, 'missing_config')
    assert.equal(res.error.message, 'no config found')
  })

  it('coerces non-Error values to string', () => {
    const res = missingConfigError('missing context') as { error: { code: string; message: string } }
    assert.equal(res.error.code, 'missing_config')
    assert.equal(res.error.message, 'missing context')
  })
})

describe('transportError', () => {
  it('appends TLS hint when error message contains SSL routines (#90)', () => {
    const err = new Error(
      'C01845ED01000000:error:0A0000C6:SSL routines:tls_get_more_records:packet length too long:ssl/record/methods/tls_common.c:661:\n'
    )
    const result = transportError(err) as { error: { message: string } }
    assert.ok(result.error.message.includes('Hint: this looks like a TLS/SSL error'))
    assert.ok(result.error.message.includes('http://'))
  })

  it('does not append TLS hint for non-TLS errors', () => {
    const err = new Error('ECONNREFUSED 127.0.0.1:9200')
    const result = transportError(err) as { error: { message: string } }
    assert.ok(!result.error.message.includes('Hint:'))
    assert.equal(result.error.message, 'ECONNREFUSED 127.0.0.1:9200')
  })

  it('detects EPROTO as a TLS error', () => {
    const err = new Error('write EPROTO')
    const result = transportError(err) as { error: { message: string } }
    assert.ok(result.error.message.includes('Hint: this looks like a TLS/SSL error'))
  })

  it('detects ERR_SSL in error message', () => {
    const err = new Error('ERR_SSL_WRONG_VERSION_NUMBER')
    const result = transportError(err) as { error: { message: string } }
    assert.ok(result.error.message.includes('Hint: this looks like a TLS/SSL error'))
  })

  it('handles non-Error values by coercing to string', () => {
    const result = transportError('raw string error') as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'transport_error')
    assert.equal(result.error.message, 'raw string error')
  })

  it('maps ResponseError to a transport_error with status_code and body', () => {
    const meta = makeDiagnosticMeta({ statusCode: 418, body: { reason: 'teapot' } })
    const err = new errors.ResponseError(meta)
    const result = transportError(err) as { error: { code: string; status_code: number | null; body: unknown } }
    assert.equal(result.error.code, 'transport_error')
    assert.equal(result.error.status_code, 418)
    assert.deepEqual(result.error.body, { reason: 'teapot' })
  })

  it('maps ResponseError with missing statusCode/body to null values', () => {
    const meta = makeDiagnosticMeta({ statusCode: undefined, body: undefined })
    const err = new errors.ResponseError(meta)
    const result = transportError(err) as { error: { code: string; status_code: number | null; body: unknown } }
    assert.equal(result.error.code, 'transport_error')
    assert.equal(result.error.status_code, null)
    assert.equal(result.error.body, null)
  })

  it('maps ConnectionError to connection_error and appends URL when available', () => {
    const meta = makeDiagnosticMeta({
      meta: {
        context: null,
        request: { params: {}, options: {}, id: 0 },
        name: 'test',
        connection: { url: new URL('http://localhost:9200') },
        attempts: 0,
        aborted: false,
      },
    })
    const err = new errors.ConnectionError('getaddrinfo ENOTFOUND', meta)
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.ok(result.error.message.includes('getaddrinfo ENOTFOUND'))
    assert.ok(result.error.message.includes('http://localhost:9200'))
  })

  it('maps ConnectionError without URL metadata using just the reason', () => {
    const err = new errors.ConnectionError('socket hang up')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.equal(result.error.message, 'socket hang up')
  })

  it('appends TLS hint to ConnectionError messages that look like TLS errors', () => {
    const err = new errors.ConnectionError('write EPROTO')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.ok(result.error.message.includes('Hint: this looks like a TLS/SSL error'))
  })

  it('falls back to "connection failed" when ConnectionError message is empty', () => {
    const err = new errors.ConnectionError('')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.equal(result.error.message, 'connection failed')
  })

  it('maps TimeoutError with message', () => {
    const err = new errors.TimeoutError('took too long', makeDiagnosticMeta())
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'timeout_error')
    assert.equal(result.error.message, 'took too long')
  })

  it('falls back to default message when TimeoutError has an empty message', () => {
    const err = new errors.TimeoutError('', makeDiagnosticMeta())
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'timeout_error')
    assert.equal(result.error.message, 'request timed out')
  })
})
