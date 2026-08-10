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

  it('validates against schemas with cosmetically invalid keywords (duplicate enum items)', () => {
    // @elastic/schemas emits nullable enums with a repeated `null` entry; AJV's
    // meta-schema check would otherwise throw before validating any input.
    const schema = {
      type: 'object',
      properties: { notify_when: { enum: ['onActiveAlert', null, null] } },
    }
    assert.deepEqual(validateWithJsonSchema(schema, { notify_when: 'onActiveAlert' }), {
      success: true,
      data: { notify_when: 'onActiveAlert' },
    })
    assert.equal(validateWithJsonSchema(schema, { notify_when: 'nope' }).success, false)
  })
})

describe('validateWithJsonSchema (path tokenization + codes) (#fix4)', () => {
  it('decomposes array-index paths into numbers, not string segments', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
      },
    }
    const result = validateWithJsonSchema(schema, { tags: [{ name: 5 }] })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.deepEqual(result.errors[0]!.path_array, ['tags', 0, 'name'])
    }
  })

  it('decomposes bracket-quoted / dotted keys without mangling', () => {
    const schema = {
      type: 'object',
      properties: { 'weird.key': { type: 'string' } },
      required: ['weird.key'],
    }
    const result = validateWithJsonSchema(schema, { 'weird.key': 5 })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.deepEqual(result.errors[0]!.path_array, ['weird.key'])
    }
  })

  it('names the missing property for required errors instead of stopping at the parent path', () => {
    const schema = {
      type: 'object',
      properties: { index: { type: 'string' } },
      required: ['index'],
    }
    const result = validateWithJsonSchema(schema, {})
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.deepEqual(result.errors[0]!.path_array, ['index'])
      assert.equal(result.errors[0]!.code, 'required')
    }
  })

  it('lists allowed values in the message for enum failures', () => {
    const schema = { type: 'object', properties: { color: { enum: ['red', 'blue'] } } }
    const result = validateWithJsonSchema(schema, { color: 'green' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.equal(result.errors[0]!.code, 'enum')
      assert.match(result.errors[0]!.message, /red/)
      assert.match(result.errors[0]!.message, /blue/)
    }
  })

  it('names the unknown field for additionalProperties failures', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false }
    const result = validateWithJsonSchema(schema, { a: 'x', b: 'y' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.equal(result.errors[0]!.code, 'additionalProperties')
      assert.match(result.errors[0]!.message, /b/)
    }
  })

  it('assigns raw type keyword as code for type mismatches', () => {
    const schema = { type: 'object', properties: { count: { type: 'integer' } } }
    const result = validateWithJsonSchema(schema, { count: 'nope' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.equal(result.errors[0]!.code, 'type')
    }
  })
})

describe('validateWithJsonSchema (code is the raw AJV keyword) (#fix4)', () => {
  it('passes the raw AJV keyword through as code, for representative keywords', () => {
    const typeResult = validateWithJsonSchema({ type: 'object', properties: { a: { type: 'string' } } }, { a: 1 })
    assert.ok(!typeResult.success)
    if (!typeResult.success) assert.equal(typeResult.errors[0]!.code, 'type')

    const requiredResult = validateWithJsonSchema({ type: 'object', required: ['a'] }, {})
    assert.ok(!requiredResult.success)
    if (!requiredResult.success) assert.equal(requiredResult.errors[0]!.code, 'required')

    const enumResult = validateWithJsonSchema({ type: 'object', properties: { a: { enum: ['x'] } } }, { a: 'y' })
    assert.ok(!enumResult.success)
    if (!enumResult.success) assert.equal(enumResult.errors[0]!.code, 'enum')

    const additionalResult = validateWithJsonSchema({ type: 'object', properties: {}, additionalProperties: false }, { a: 1 })
    assert.ok(!additionalResult.success)
    if (!additionalResult.success) assert.equal(additionalResult.errors[0]!.code, 'additionalProperties')
  })
})

describe('validateWithJsonSchema (ajv6 compile robustness) (#fix5)', () => {
  it('does not throw on an unknown `format` keyword and validates the rest of the schema', () => {
    const schema = {
      type: 'object',
      properties: { x: { type: 'string', format: 'duration' } },
      required: ['x'],
    }
    assert.doesNotThrow(() => validateWithJsonSchema(schema, { x: 'hello' }))
    const good = validateWithJsonSchema(schema, { x: 'hello' })
    assert.equal(good.success, true)
    const bad = validateWithJsonSchema(schema, {})
    assert.equal(bad.success, false)
  })

  it('surfaces an uncompilable schema as a structured error instead of throwing', () => {
    const schema = {
      type: 'object',
      properties: { x: { type: 'string', pattern: '(' } }, // invalid regex
    }
    assert.doesNotThrow(() => validateWithJsonSchema(schema, { x: 'y' }))
    const result = validateWithJsonSchema(schema, { x: 'y' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    if (!result.success) {
      assert.ok(result.errors.some(e => e.code === 'schema_compile_failed'), `expected schema_compile_failed, got: ${JSON.stringify(result.errors)}`)
    }
  })
})
