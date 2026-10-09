/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encodeApiPath } from '../../src/api/path.ts'

describe('encodeApiPath', () => {
  it('encodes the root path', () => {
    assert.deepEqual(encodeApiPath('/'), { pathname: '/', query: {} })
    assert.deepEqual(encodeApiPath(''), { pathname: '/', query: {} })
  })

  it('adds a leading slash', () => {
    assert.equal(encodeApiPath('_cluster/health').pathname, '/_cluster/health')
  })

  it('drops a trailing slash', () => {
    assert.equal(encodeApiPath('/foo/').pathname, '/foo')
  })

  it('percent-encodes reserved characters in a segment', () => {
    assert.equal(encodeApiPath('/foo bar').pathname, '/foo%20bar')
    assert.equal(encodeApiPath('/a#b').pathname, '/a')
    assert.equal(encodeApiPath('/idx?pretty=true').pathname, '/idx')
    assert.deepEqual(encodeApiPath('/idx?pretty=true').query, { pretty: 'true' })
  })

  it('rejects empty, dot, and parent segments', () => {
    assert.throws(() => encodeApiPath('/foo/../bar'), /input_error|Invalid path/)
    assert.throws(() => encodeApiPath('../etc'), /Invalid path/)
    assert.throws(() => encodeApiPath('/.'), /Invalid path/)
    assert.throws(() => encodeApiPath('/foo//bar'), /Invalid path/)
  })

  it('rejects percent-encoded parent segments', () => {
    assert.throws(() => encodeApiPath('/%2e%2e/etc'), /Invalid path/)
    assert.throws(() => encodeApiPath('/%2E%2E'), /Invalid path/)
    assert.throws(() => encodeApiPath('/%2e'), /Invalid path/)
  })

  it('rejects malformed percent-encoding', () => {
    assert.throws(() => encodeApiPath('/foo%zz'), /malformed percent-encoding/)
  })

  it('parses query values without treating # as part of the path', () => {
    const encoded = encodeApiPath('/_search?q=foo#ignored')
    assert.equal(encoded.pathname, '/_search')
    assert.equal(encoded.query['q'], 'foo')
  })

  it('treats ?# as the root path with no query', () => {
    assert.deepEqual(encodeApiPath('?#'), { pathname: '/', query: {} })
  })

  it('encodes a slash inside a single segment after decode', () => {
    assert.equal(encodeApiPath('/foo%2Fbar').pathname, '/foo%2Fbar')
  })
})
