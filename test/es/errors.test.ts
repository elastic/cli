/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transportError } from '../../src/es/errors.ts'

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
})
