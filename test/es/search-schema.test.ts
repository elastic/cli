/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SearchRequest } from '@elastic/es-schemas/search.js'

describe('SearchRequest schema', () => {
  it('accepts all Elasticsearch _source request body forms', () => {
    for (const source of [
      true,
      'title',
      ['title', 'author', 'views'],
      { includes: ['title', 'author'], excludes: ['body'] },
    ]) {
      const result = SearchRequest.safeParse({ size: 3, _source: source })
      assert.equal(result.success, true)
    }
  })
})
