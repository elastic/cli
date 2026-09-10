/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apiManifest, loadEsApi, loadEsApisInFile } from '../../src/es/apis.ts'

describe('loadEsApisInFile', () => {
  it('returns the cached promise on a repeated call for the same namespace file', async () => {
    const meta = apiManifest[0]!
    const [first, second] = await Promise.all([
      loadEsApisInFile(meta.namespaceFile),
      loadEsApisInFile(meta.namespaceFile),
    ])
    // second call hits the in-memory module cache instead of re-importing/re-resolving
    assert.equal(first, second)
    assert.ok(first.length > 0)
  })
})

describe('loadEsApi', () => {
  it('locates a definition by manifest entry', async () => {
    const meta = apiManifest.find((m) => m.name === 'search' && m.namespace == null) ?? apiManifest[0]!
    const def = await loadEsApi(meta)
    assert.equal(def.name, meta.name)
  })

  it('throws when the manifest entry has no match in its namespace file', async () => {
    const meta = apiManifest[0]!
    await assert.rejects(
      async () => loadEsApi({ ...meta, name: 'does-not-exist-in-file' }),
      /internal error: manifest entry ".*" has no match in/
    )
  })
})
