/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stripHtmlTags, newUuid } from '../../src/docs/client.ts'

describe('docs client utilities', () => {
  describe('stripHtmlTags', () => {
    it('removes simple HTML tags', () => {
      assert.equal(stripHtmlTags('<mark>highlighted</mark> text'), 'highlighted text')
    })

    it('removes multiple tags', () => {
      assert.equal(stripHtmlTags('<b>bold</b> and <em>italic</em>'), 'bold and italic')
    })

    it('passes through plain text unchanged', () => {
      assert.equal(stripHtmlTags('no tags here'), 'no tags here')
    })

    it('handles empty string', () => {
      assert.equal(stripHtmlTags(''), '')
    })
  })

  describe('newUuid', () => {
    it('generates a UUID v4 formatted string', () => {
      const uuid = newUuid()
      assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('generates unique values', () => {
      const ids = new Set(Array.from({ length: 10 }, () => newUuid()))
      assert.equal(ids.size, 10)
    })
  })
})
