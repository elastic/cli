/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deprecationNote, commandDeprecation, withDeprecatedMarker } from '../../src/lib/deprecation.ts'

describe('deprecationNote', () => {
  it('returns undefined for missing or empty annotations', () => {
    assert.equal(deprecationNote(undefined), undefined)
    assert.equal(deprecationNote(null), undefined)
    assert.equal(deprecationNote({}), undefined)
    assert.equal(deprecationNote(42), undefined)
  })

  it('prefers since over description', () => {
    assert.equal(deprecationNote({ since: '8.11.0' }), 'since 8.11.0')
    assert.equal(
      deprecationNote({ since: '9.0.0', description: 'No effect.' }),
      'since 9.0.0',
    )
  })

  it('falls back to description and plain strings', () => {
    assert.equal(deprecationNote({ description: 'Use v2.' }), 'Use v2.')
    assert.equal(deprecationNote('legacy'), 'legacy')
    assert.equal(deprecationNote(''), undefined)
  })
})

describe('commandDeprecation', () => {
  it('prefers an explicit deprecated field over x-deprecated', () => {
    assert.equal(commandDeprecation({ deprecated: 'old', 'x-deprecated': { since: '9.0.0' } }), 'old')
  })

  it('reads top-level x-deprecated from generated definitions', () => {
    assert.equal(commandDeprecation({ 'x-deprecated': { since: '8.11.0' } }), 'since 8.11.0')
    assert.equal(commandDeprecation({}), undefined)
  })

  it('returns undefined for non-objects', () => {
    assert.equal(commandDeprecation(null), undefined)
    assert.equal(commandDeprecation('x'), undefined)
  })
})

describe('withDeprecatedMarker', () => {
  it('leaves text unchanged without a note', () => {
    assert.equal(withDeprecatedMarker('Do things', undefined), 'Do things')
  })

  it('appends the marker with a note', () => {
    assert.equal(withDeprecatedMarker('Do things', 'since 8.11.0'), 'Do things (deprecated: since 8.11.0)')
  })
})
