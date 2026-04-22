/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { simplifyZodIssues, formatIssuesText } from '../../src/lib/zod-error.ts'

/**
 * Helper: run a schema against input and return the raw issues produced by Zod.
 * Using real Zod errors keeps tests honest about the issue shapes we rely on.
 */
function issuesFor (schema: z.ZodType, input: unknown): readonly z.core.$ZodIssue[] {
  const r = schema.safeParse(input)
  if (r.success) throw new Error('expected validation to fail')
  return r.error.issues
}

describe('simplifyZodIssues', () => {
  it('passes non-union issues through unchanged', () => {
    const schema = z.object({ name: z.string() })
    const raw = issuesFor(schema, { name: 42 })
    const simplified = simplifyZodIssues(raw)
    assert.equal(simplified.length, 1)
    assert.equal(simplified[0].code, 'invalid_type')
    assert.deepEqual(simplified[0].path, ['name'])
  })

  it('collapses invalid_union to the variant whose errors reach deepest', () => {
    // Mimics a discriminated-ish union: only one branch's shape matches
    // the shape of the input, so the correct variant to surface is `term`.
    const schema = z.object({
      query: z.union([
        z.object({ bool: z.object({ must: z.array(z.unknown()) }) }),
        z.object({ match_all: z.object({}) }),
        z.object({ term: z.object({ category: z.object({ value: z.string() }) }) }),
      ])
    })
    const raw = issuesFor(schema, { query: { term: { category: 'canyon' } } })
    const simplified = simplifyZodIssues(raw)
    // The deepest issue is "expected object, received string" at query.term.category
    const deepest = simplified.find(i => i.path.length >= 3)
    assert.ok(deepest, `expected a deep issue, got: ${JSON.stringify(simplified)}`)
    assert.deepEqual(deepest.path, ['query', 'term', 'category'])
    assert.equal(deepest.code, 'invalid_type')
    assert.match(deepest.message, /expected object/i)
    // No 'received undefined' noise from non-matching variants
    for (const i of simplified) {
      assert.ok(!/received undefined/.test(i.message),
        `leaked discriminator noise: ${i.message} at ${JSON.stringify(i.path)}`)
    }
  })

  it('flattens nested unions recursively', () => {
    // outer union picks `outer.nested` variant -> inner union picks the variant
    // whose object matches the input shape.
    const schema = z.object({
      outer: z.union([
        z.object({ simple: z.string() }),
        z.object({
          nested: z.union([
            z.object({ a: z.object({ value: z.string() }) }),
            z.object({ b: z.object({ value: z.string() }) }),
          ])
        }),
      ])
    })
    const raw = issuesFor(schema, { outer: { nested: { a: 'bad' } } })
    const simplified = simplifyZodIssues(raw)
    const deepest = simplified.find(i => i.path.includes('a'))
    assert.ok(deepest, `expected nested-a issue, got: ${JSON.stringify(simplified)}`)
    assert.deepEqual(deepest.path, ['outer', 'nested', 'a'])
    // No invalid_union should remain after flattening
    assert.ok(simplified.every(i => i.code !== 'invalid_union'),
      'invalid_union leaked through')
  })

  it('prepends union issue path to chosen variant sub-issues', () => {
    const schema = z.object({
      wrapper: z.object({
        q: z.union([
          z.object({ term: z.object({ field: z.string() }) }),
          z.object({ match: z.object({ field: z.string() }) }),
        ])
      })
    })
    const raw = issuesFor(schema, { wrapper: { q: { term: { field: 42 } } } })
    const simplified = simplifyZodIssues(raw)
    const target = simplified.find(i => i.code === 'invalid_type')
    assert.ok(target)
    assert.deepEqual(target.path, ['wrapper', 'q', 'term', 'field'])
  })

  it('preserves the original issue when no variants are available', () => {
    // A union with empty errors array (the rare "multiple match" case). We
    // construct it manually since there is no schema shape that produces it
    // in a stable way.
    const fabricated: z.core.$ZodIssue = {
      code: 'invalid_union',
      path: ['root'],
      message: 'Invalid input',
      errors: []
    } as z.core.$ZodIssue
    const simplified = simplifyZodIssues([fabricated])
    assert.equal(simplified.length, 1)
    assert.equal(simplified[0].code, 'invalid_union')
  })

  it('handles multiple top-level issues independently', () => {
    const schema = z.object({
      a: z.union([z.object({ x: z.string() }), z.object({ y: z.string() })]),
      b: z.number(),
    })
    const raw = issuesFor(schema, { a: { x: 1 }, b: 'bad' })
    const simplified = simplifyZodIssues(raw)
    // Both fields represented: b directly, a via its best variant
    assert.ok(simplified.some(i => i.path[0] === 'b' && i.code === 'invalid_type'))
    assert.ok(simplified.some(i => i.path[0] === 'a'))
  })
})

describe('formatIssuesText', () => {
  it('renders one issue as two lines', () => {
    const out = formatIssuesText([
      { code: 'invalid_type', path: ['name'], message: 'expected string, received number' } as z.core.$ZodIssue
    ])
    assert.equal(out, '✖ expected string, received number\n  → at name')
  })

  it('joins multiple issues with newlines', () => {
    const out = formatIssuesText([
      { code: 'invalid_type', path: ['name'], message: 'A' } as z.core.$ZodIssue,
      { code: 'invalid_type', path: ['count'], message: 'B' } as z.core.$ZodIssue,
    ])
    assert.equal(out.split('\n').length, 4)
    assert.match(out, /at name/)
    assert.match(out, /at count/)
  })

  it('formats nested paths with dots and array indices with brackets', () => {
    const out = formatIssuesText([
      { code: 'invalid_type', path: ['a', 'b', 0, 'c'], message: 'boom' } as z.core.$ZodIssue
    ])
    assert.match(out, /at a\.b\[0\]\.c/)
  })

  it('renders empty list as generic message', () => {
    assert.equal(formatIssuesText([]), '✖ Invalid input')
  })

  it('renders root-level issues with "(root)" path', () => {
    const out = formatIssuesText([
      { code: 'invalid_type', path: [], message: 'broken' } as z.core.$ZodIssue
    ])
    assert.match(out, /at \(root\)/)
  })
})
