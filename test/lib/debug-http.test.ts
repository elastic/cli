/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isHttpDebugEnabled, logHttpDebug, setHttpDebugEnabled } from '../../src/lib/debug-http.ts'

function captureStderr (fn: () => Promise<unknown> | unknown): Promise<string> {
  const chunks: string[] = []
  const origWrite = process.stderr.write
  process.stderr.write = ((chunk: string) => { chunks.push(chunk); return true }) as typeof process.stderr.write
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.stderr.write = origWrite
    })
    .then(() => chunks.join(''))
}

describe('HTTP debug logging', () => {
  it('is enabled by ELASTIC_DEBUG=1', () => {
    const previous = process.env['ELASTIC_DEBUG']
    try {
      process.env['ELASTIC_DEBUG'] = '1'
      assert.equal(isHttpDebugEnabled(), true)
    } finally {
      if (previous === undefined) delete process.env['ELASTIC_DEBUG']
      else process.env['ELASTIC_DEBUG'] = previous
    }
  })

  it('is enabled by the root --debug option', () => {
    try {
      setHttpDebugEnabled(true)
      assert.equal(isHttpDebugEnabled(), true)
    } finally {
      setHttpDebugEnabled(false)
    }
  })

  it('redacts credentials and logs request and response details to stderr', async () => {
    const stderr = await captureStderr(async () => {
      setHttpDebugEnabled(true)
      await logHttpDebug({
        method: 'POST',
        url: 'https://example.com/_search',
        headers: {
          Authorization: 'ApiKey secret',
          'X-Api-Key': 'another-secret',
          Accept: 'application/json',
        },
        body: '{"query":{"match_all":{}}}',
        response: new Response('{"ok":true}', { status: 201 }),
      })
      setHttpDebugEnabled(false)
    })

    assert.match(stderr, /POST https:\/\/example\.com\/_search/)
    assert.match(stderr, /Authorization: \(redacted\)/)
    assert.match(stderr, /X-Api-Key: \(redacted\)/)
    assert.match(stderr, /Accept: application\/json/)
    assert.match(stderr, /\{"query":\{"match_all":\{\}\}\}/)
    assert.match(stderr, /Response: 201/)
    assert.match(stderr, /\{"ok":true\}/)
    assert.doesNotMatch(stderr, /secret/)
    assert.doesNotMatch(stderr, /another-secret/)
  })

})
