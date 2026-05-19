/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EsResponseError, EsConnectionError } from '../../src/lib/es-client.ts'
import { transportError, missingConfigError } from '../../src/es/errors.ts'

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

  it('maps EsResponseError to a transport_error with status_code and body', () => {
    const err = new EsResponseError(418, { reason: 'teapot' })
    const result = transportError(err) as { error: { code: string; status_code: number; body: unknown } }
    assert.equal(result.error.code, 'transport_error')
    assert.equal(result.error.status_code, 418)
    assert.deepEqual(result.error.body, { reason: 'teapot' })
  })

  it('maps EsResponseError with null body to null', () => {
    const err = new EsResponseError(500, null)
    const result = transportError(err) as { error: { code: string; status_code: number; body: unknown } }
    assert.equal(result.error.code, 'transport_error')
    assert.equal(result.error.status_code, 500)
    assert.equal(result.error.body, null)
  })

  it('maps EsConnectionError to connection_error', () => {
    const err = new EsConnectionError('socket hang up')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.equal(result.error.message, 'socket hang up')
  })

  it('appends TLS hint to EsConnectionError messages that look like TLS errors', () => {
    const err = new EsConnectionError('write EPROTO')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.ok(result.error.message.includes('Hint: this looks like a TLS/SSL error'))
  })

  it('falls back to "connection failed" when EsConnectionError message is empty', () => {
    const err = new EsConnectionError('')
    const result = transportError(err) as { error: { code: string; message: string } }
    assert.equal(result.error.code, 'connection_error')
    assert.equal(result.error.message, 'connection failed')
  })
})
