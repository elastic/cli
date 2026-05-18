/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickFields, parseFieldList, applyTemplate } from '../../src/lib/output-transform.ts'

// ---------------------------------------------------------------------------
// parseFieldList
// ---------------------------------------------------------------------------

describe('parseFieldList', () => {
  it('splits comma-separated fields', () => {
    assert.deepEqual(parseFieldList('id,name,score'), ['id', 'name', 'score'])
  })

  it('trims whitespace around fields', () => {
    assert.deepEqual(parseFieldList('id , name , score'), ['id', 'name', 'score'])
  })

  it('drops empty entries from trailing commas', () => {
    assert.deepEqual(parseFieldList('id,name,'), ['id', 'name'])
  })

  it('handles a single field', () => {
    assert.deepEqual(parseFieldList('id'), ['id'])
  })
})

// ---------------------------------------------------------------------------
// pickFields — flat objects
// ---------------------------------------------------------------------------

describe('pickFields — flat objects', () => {
  it('picks specified top-level keys', () => {
    const input = { id: 1, name: 'foo', status: 'ok', extra: true }
    assert.deepEqual(pickFields(input, ['id', 'name']), { id: 1, name: 'foo' })
  })

  it('silently omits missing fields', () => {
    const input = { id: 1, name: 'foo' }
    assert.deepEqual(pickFields(input, ['id', 'missing']), { id: 1 })
  })

  it('returns empty object when no fields match', () => {
    assert.deepEqual(pickFields({ a: 1 }, ['x', 'y']), {})
  })
})

// ---------------------------------------------------------------------------
// pickFields — dot-notation (nested)
// ---------------------------------------------------------------------------

describe('pickFields — dot-notation', () => {
  it('picks nested fields with dot-notation', () => {
    const input = { hits: { total: 42, max_score: 1.5 }, took: 10 }
    assert.deepEqual(pickFields(input, ['hits.total', 'took']), { hits: { total: 42 }, took: 10 })
  })

  it('handles deeply nested paths', () => {
    const input = { a: { b: { c: { d: 'deep' } } } }
    assert.deepEqual(pickFields(input, ['a.b.c.d']), { a: { b: { c: { d: 'deep' } } } })
  })

  it('omits dot-paths where intermediate is missing', () => {
    const input = { a: 1 }
    assert.deepEqual(pickFields(input, ['a.b.c']), {})
  })
})

// ---------------------------------------------------------------------------
// pickFields — literal-dotted keys (cat API style)
// ---------------------------------------------------------------------------

describe('pickFields — literal-dotted keys', () => {
  it('matches a literal-dotted key (cat-API case)', () => {
    const input = { 'docs.count': '5', index: 'x' }
    assert.deepEqual(pickFields(input, ['docs.count']), { 'docs.count': '5' })
  })

  it('still descends nested objects when no literal key exists', () => {
    const input = { docs: { count: '5' } }
    assert.deepEqual(pickFields(input, ['docs.count']), { docs: { count: '5' } })
  })

  it('prefers the literal key over a nested path when both exist', () => {
    const input = { 'docs.count': '10', docs: { count: '5' } }
    assert.deepEqual(pickFields(input, ['docs.count']), { 'docs.count': '10' })
  })

  it('preserves all fields on a cat-indices-shaped row', () => {
    const input = [
      { health: 'green', index: 'i', 'docs.count': '5', 'store.size': '31kb' },
    ]
    assert.deepEqual(
      pickFields(input, ['index', 'docs.count', 'store.size']),
      [{ index: 'i', 'docs.count': '5', 'store.size': '31kb' }],
    )
  })
})

// ---------------------------------------------------------------------------
// pickFields — arrays
// ---------------------------------------------------------------------------

describe('pickFields — arrays', () => {
  it('picks fields from each element in an array', () => {
    const input = [
      { id: 1, name: 'a', extra: true },
      { id: 2, name: 'b', extra: false },
    ]
    assert.deepEqual(pickFields(input, ['id', 'name']), [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
  })

  it('returns empty objects for array elements with no matching fields', () => {
    const input = [{ x: 1 }, { x: 2 }]
    assert.deepEqual(pickFields(input, ['z']), [{}, {}])
  })
})

// ---------------------------------------------------------------------------
// pickFields — projection across arrays (mid-path)
// ---------------------------------------------------------------------------

describe('pickFields — projection across arrays', () => {
  it('projects a leaf path across an inner array', () => {
    const input = { hits: { hits: [{ _id: 'x' }, { _id: 'y' }] } }
    assert.deepEqual(pickFields(input, ['hits.hits._id']), { hits: { hits: { _id: ['x', 'y'] } } })
  })

  it('projects multiple paths across an inner array', () => {
    const input = {
      hits: {
        hits: [
          { _id: '1', _source: { title: 'First' } },
          { _id: '2', _source: { title: 'Second' } },
        ],
      },
    }
    assert.deepEqual(pickFields(input, ['hits.hits._id', 'hits.hits._source.title']), {
      hits: {
        hits: {
          _id: ['1', '2'],
          _source: { title: ['First', 'Second'] },
        },
      },
    })
  })

  it('drops array elements where the projected path is missing', () => {
    const input = { items: [{ a: 1 }, { b: 2 }, { a: 3 }] }
    assert.deepEqual(pickFields(input, ['items.a']), { items: { a: [1, 3] } })
  })

  it('returns an empty array when no element matches the path', () => {
    const input = { items: [{ a: 1 }, { a: 2 }] }
    assert.deepEqual(pickFields(input, ['items.b']), { items: { b: [] } })
  })

  it('handles nested arrays in the middle of a path', () => {
    const input = {
      groups: [
        { items: [{ id: 'a' }, { id: 'b' }] },
        { items: [{ id: 'c' }] },
      ],
    }
    assert.deepEqual(pickFields(input, ['groups.items.id']), {
      groups: { items: { id: [['a', 'b'], ['c']] } },
    })
  })
})

// ---------------------------------------------------------------------------
// pickFields — primitives (pass-through)
// ---------------------------------------------------------------------------

describe('pickFields — primitives', () => {
  it('returns string unchanged', () => {
    assert.equal(pickFields('hello', ['id']), 'hello')
  })

  it('returns number unchanged', () => {
    assert.equal(pickFields(42, ['id']), 42)
  })

  it('returns null unchanged', () => {
    assert.equal(pickFields(null, ['id']), null)
  })
})

// ---------------------------------------------------------------------------
// applyTemplate — objects
// ---------------------------------------------------------------------------

describe('applyTemplate — objects', () => {
  it('substitutes top-level fields', () => {
    const input = { id: 1, name: 'foo', score: 9.5 }
    assert.equal(applyTemplate(input, '{{id}}: {{name}} ({{score}})'), '1: foo (9.5)\n')
  })

  it('substitutes nested fields with dot-notation', () => {
    const input = { hit: { id: 'abc', source: { title: 'Hello' } } }
    assert.equal(applyTemplate(input, '{{hit.id}} — {{hit.source.title}}'), 'abc — Hello\n')
  })

  it('replaces missing fields with empty string', () => {
    const input = { id: 1 }
    assert.equal(applyTemplate(input, '{{id}} {{missing}}'), '1 \n')
  })

  it('serializes object fields as JSON', () => {
    const input = { id: 1, meta: { a: 2 } }
    assert.equal(applyTemplate(input, '{{id}} {{meta}}'), '1 {"a":2}\n')
  })
})

// ---------------------------------------------------------------------------
// applyTemplate — arrays (one line per element)
// ---------------------------------------------------------------------------

describe('applyTemplate — arrays', () => {
  it('renders one line per array element', () => {
    const input = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]
    assert.equal(applyTemplate(input, '{{id}}: {{name}}'), '1: a\n2: b\n')
  })

  it('handles empty arrays', () => {
    assert.equal(applyTemplate([], '{{id}}'), '')
  })
})

// ---------------------------------------------------------------------------
// applyTemplate — primitives
// ---------------------------------------------------------------------------

describe('applyTemplate — primitives', () => {
  it('replaces {{.}} with the primitive value', () => {
    assert.equal(applyTemplate('hello', 'value={{.}}'), 'value=hello\n')
  })

  it('replaces bare {{}} with the primitive value', () => {
    assert.equal(applyTemplate(42, 'num={{}}'), 'num=42\n')
  })
})

// ---------------------------------------------------------------------------
// pickFields + applyTemplate combined
// ---------------------------------------------------------------------------

describe('pickFields + applyTemplate combined', () => {
  it('fields narrow data before template renders it', () => {
    const input = { id: 1, name: 'foo', secret: 'hidden' }
    const picked = pickFields(input, ['id', 'name'])
    assert.equal(applyTemplate(picked, '{{id}}: {{name}} {{secret}}'), '1: foo \n')
  })
})
