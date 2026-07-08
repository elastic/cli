/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateWithJsonSchema, formatValidationErrors } from '../../src/lib/ajv-validate.ts'

describe('validateWithJsonSchema', () => {
  it('returns success: true for valid input', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
    const result = validateWithJsonSchema(schema, { name: 'hello' })
    assert.equal(result.success, true)
  })

  it('returns success: false for invalid input', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
    const result = validateWithJsonSchema(schema, {})
    assert.equal(result.success, false)
  })

  it('includes errors for missing required fields', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' }, count: { type: 'integer' } }, required: ['name', 'count'] }
    const result = validateWithJsonSchema(schema, {})
    assert.equal(result.success, false)
    assert.ok(!result.success && result.errors.length >= 1, 'expected at least one error')
    const messages = result.errors.map(e => e.message)
    assert.ok(messages.some(m => m.includes('name') || m.includes('required')), `expected required error, got: ${JSON.stringify(messages)}`)
  })

  it('applies default values from schema with useDefaults', () => {
    const schema = {
      type: 'object',
      properties: {
        index: { type: 'string' },
        size: { type: 'integer', default: 10 },
      },
      required: ['index'],
    }
    const result = validateWithJsonSchema(schema, { index: 'my-index' })
    assert.equal(result.success, true)
    assert.ok(result.success && result.data.size === 10, `expected default size=10, got: ${JSON.stringify(result.success && result.data)}`)
  })

  it('does not mutate the original input object', () => {
    const schema = { type: 'object', properties: { size: { type: 'integer', default: 10 } } }
    const input = {}
    validateWithJsonSchema(schema, input)
    assert.equal(Object.keys(input).length, 0, 'original input must not be mutated')
  })

  it('strips $schema key before compiling', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { x: { type: 'string' } },
      required: ['x'],
    }
    assert.doesNotThrow(() => validateWithJsonSchema(schema, { x: 'hello' }), 'should not throw on 2020-12 $schema')
  })

  it('handles nested object schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: { zipCode: { type: 'string' } },
          required: ['zipCode'],
        },
      },
      required: ['address'],
    }
    const good = validateWithJsonSchema(schema, { address: { zipCode: '12345' } })
    assert.equal(good.success, true)
    const bad = validateWithJsonSchema(schema, { address: {} })
    assert.equal(bad.success, false)
  })

  it('handles schemas with $ref to $defs', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { $ref: '#/$defs/Id', 'x-found-in': 'path' },
      },
      required: ['id'],
      $defs: {
        Id: { type: 'string' },
      },
    }
    const good = validateWithJsonSchema(schema, { id: 'abc' })
    assert.equal(good.success, true)
    const bad = validateWithJsonSchema(schema, {})
    assert.equal(bad.success, false)
  })
})

describe('formatValidationErrors', () => {
  it('formats errors as readable text', () => {
    const errors = [
      { path: '.name', message: "should have required property 'name'" },
    ]
    const text = formatValidationErrors(errors)
    assert.match(text, /✖/)
    assert.match(text, /name/)
  })

  it('returns a fallback for empty errors array', () => {
    const text = formatValidationErrors([])
    assert.ok(text.length > 0, 'should return non-empty fallback')
  })

  it('formats multiple errors', () => {
    const errors = [
      { path: '.name', message: 'should be string' },
      { path: '.count', message: 'should be integer' },
    ]
    const text = formatValidationErrors(errors)
    assert.match(text, /name/)
    assert.match(text, /count/)
  })
})

describe('validateWithJsonSchema (anyOf deduplication)', () => {
  // AJV with allErrors:true emits one error per anyOf branch plus a root-level
  // 'should match some schema in anyOf'. Verify those are collapsed to the actionable subset.
  it('collapses anyOf noise into the deepest actionable error', () => {
    const schema = {
      type: 'object',
      properties: {
        query: {
          anyOf: [
            { type: 'object', properties: { bool: { type: 'object' } }, additionalProperties: false },
            { type: 'object', properties: { term: { type: 'object', additionalProperties: { type: 'object' } } }, additionalProperties: false },
            { type: 'object', properties: { match: { type: 'object' } }, additionalProperties: false },
          ],
        },
      },
    }
    // {term: 'canyon'} fails: term should be object, and bool/match branches reject unknown keys
    const result = validateWithJsonSchema(schema, { query: { term: 'canyon' } })
    assert.equal(result.success, false)
    // Should NOT have 10+ errors — should have at most 2 (the deepest path + maybe one root)
    assert.ok(result.errors.length <= 3, `expected <=3 errors after dedup, got ${result.errors.length}: ${JSON.stringify(result.errors)}`)
    // The actionable error about term should be present
    const messages = result.errors.map(e => e.message)
    assert.ok(messages.some(m => m.includes('object') || m.includes('term')), `expected object/term error, got: ${JSON.stringify(messages)}`)
  })

  it('keeps all errors when there are no anyOf duplicates', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name', 'age'],
    }
    const result = validateWithJsonSchema(schema, {})
    assert.equal(result.success, false)
    assert.equal(result.errors.length, 2, `expected 2 errors, got ${result.errors.length}`)
  })
})
