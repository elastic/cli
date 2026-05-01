/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isLoopbackUrl } from '../../src/lib/is-loopback-host.ts'

describe('isLoopbackUrl', () => {
  it('returns true for http://localhost', () => {
    assert.equal(isLoopbackUrl('http://localhost'), true)
  })

  it('returns true for http://localhost:9200', () => {
    assert.equal(isLoopbackUrl('http://localhost:9200'), true)
  })

  it('returns true for https://localhost:5601/path', () => {
    assert.equal(isLoopbackUrl('https://localhost:5601/path'), true)
  })

  it('returns true for http://127.0.0.1', () => {
    assert.equal(isLoopbackUrl('http://127.0.0.1'), true)
  })

  it('returns true for http://127.0.0.1:9200', () => {
    assert.equal(isLoopbackUrl('http://127.0.0.1:9200'), true)
  })

  it('returns true for http://[::1]:9200', () => {
    assert.equal(isLoopbackUrl('http://[::1]:9200'), true)
  })

  it('returns false for http://localhost.attacker.com', () => {
    assert.equal(isLoopbackUrl('http://localhost.attacker.com'), false)
  })

  it('returns false for http://not-localhost:9200', () => {
    assert.equal(isLoopbackUrl('http://not-localhost:9200'), false)
  })

  it('returns false for http://example.com/localhost', () => {
    assert.equal(isLoopbackUrl('http://example.com/localhost'), false)
  })

  it('returns false for http://127.0.0.1.evil.com', () => {
    assert.equal(isLoopbackUrl('http://127.0.0.1.evil.com'), false)
  })

  it('returns false for a remote HTTPS URL', () => {
    assert.equal(isLoopbackUrl('https://my-cluster.es.cloud.elastic.co:9243'), false)
  })

  it('returns false for an invalid URL', () => {
    assert.equal(isLoopbackUrl('not-a-url'), false)
  })
})
