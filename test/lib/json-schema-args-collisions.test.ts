/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'

// Helper: build a minimal JSON Schema for testing
function schema (
  properties: Record<string, Record<string, unknown>>,
  required: string[] = []
): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

describe('extractSchemaArgs collision handling', () => {
  it('throws loudly on an unrecognized duplicate-flag collision', () => {
    const s = schema({
      num_shards: { type: 'number' },
      numShards: { type: 'number' },
    })
    assert.throws(() => extractSchemaArgs(s), /collides with.*--num-shards/)
  })

  it('throws loudly on an unrecognized reserved-flag collision', () => {
    const s = schema({
      json: { type: 'string' },
    })
    assert.throws(() => extractSchemaArgs(s), /reserved flag "--json"/)
  })

  it('allows the known upstream `_version`/`version` collision without throwing', () => {
    const s = schema({
      _version: { type: 'string' },
      version: { type: 'number' },
    })
    const args = extractSchemaArgs(s)
    // `_version` keeps the `--version` flag; the colliding `version` field is still dropped.
    assert.equal(args.length, 1)
    assert.equal(args[0]?.schemaKey, '_version')
  })
})
