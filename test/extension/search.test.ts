/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { searchExtensions } from '../../src/extension/search.ts'

// ---------------------------------------------------------------------------
// Fetch stub
// ---------------------------------------------------------------------------

type FetchFn = typeof globalThis.fetch
let _originalFetch: FetchFn
let _stubResponse: { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> } | null = null

function stubFetch (response: typeof _stubResponse): void {
  _stubResponse = response
  globalThis.fetch = async () => {
    if (_stubResponse == null) throw new Error('No stub response configured')
    return {
      ok: _stubResponse.ok,
      status: _stubResponse.status,
      statusText: _stubResponse.statusText,
      json: _stubResponse.json,
    } as Response
  }
}

before(() => { _originalFetch = globalThis.fetch })
after(() => { globalThis.fetch = _originalFetch })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS = [
  { full_name: 'elastic/elastic-local', description: 'Local stack lifecycle', html_url: 'https://github.com/elastic/elastic-local' },
  { full_name: 'acme/elastic-diag', description: null, html_url: 'https://github.com/acme/elastic-diag' },
]

describe('searchExtensions', () => {
  it('returns mapped results from the GitHub API', async () => {
    stubFetch({ ok: true, status: 200, statusText: 'OK', json: async () => ({ items: SAMPLE_ITEMS }) })
    const results = await searchExtensions()
    assert.equal(results.length, 2)
    assert.equal(results[0]!.repo, 'elastic/elastic-local')
    assert.equal(results[0]!.description, 'Local stack lifecycle')
    assert.equal(results[0]!.installCommand, 'elastic extension install github:elastic/elastic-local')
    assert.equal(results[1]!.description, '', 'null description should become empty string')
  })

  it('returns empty array when no results found', async () => {
    stubFetch({ ok: true, status: 200, statusText: 'OK', json: async () => ({ items: [] }) })
    const results = await searchExtensions()
    assert.deepEqual(results, [])
  })

  it('throws a rate-limit error on 403', async () => {
    stubFetch({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) })
    await assert.rejects(searchExtensions(), /rate limit/)
  })

  it('throws a rate-limit error on 429', async () => {
    stubFetch({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) })
    await assert.rejects(searchExtensions(), /rate limit/)
  })

  it('throws a generic API error on other non-ok responses', async () => {
    stubFetch({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) })
    await assert.rejects(searchExtensions(), /GitHub API error: 500/)
  })

  it('includes the install command with the correct github: prefix', async () => {
    stubFetch({ ok: true, status: 200, statusText: 'OK', json: async () => ({ items: SAMPLE_ITEMS }) })
    const results = await searchExtensions('local')
    for (const r of results) {
      assert.ok(r.installCommand.startsWith('elastic extension install github:'))
    }
  })
})
