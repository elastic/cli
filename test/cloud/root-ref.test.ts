/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadCloudApis } from '../../src/cloud/apis.ts'
import { buildCloudJsonSchema } from '../../src/cloud/types.ts'
import { buildCloudRequestParams } from '../../src/cloud/request-builder.ts'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'
import type { ParsedResult } from '../../src/factory.ts'
import { validateWithJsonSchema } from '../../src/lib/ajv-validate.ts'

/** Regression: real cloud definitions whose input is a root `$ref` (no top-level `properties`). */
async function findDef (name: string) {
  const defs = await loadCloudApis()
  const def = defs.find((d) => d.name === name)
  assert.ok(def != null, `expected to find cloud definition "${name}"`)
  return def
}

describe('root-$ref cloud input schemas', () => {
  it('buildCloudJsonSchema emits the real properties for delete-api-keys, not {}', async () => {
    const def = await findDef('delete-api-keys')
    const schema = buildCloudJsonSchema(def)
    assert.deepEqual(schema['properties'], { keys: { type: 'array', items: { type: 'string' } } })
    assert.deepEqual(schema['required'], ['keys'])
  })

  it('CLI flags are derived for the body fields of delete-api-keys', async () => {
    const def = await findDef('delete-api-keys')
    const schema = buildCloudJsonSchema(def)
    const args = extractSchemaArgs(schema)
    assert.ok(args.some((a) => a.schemaKey === 'keys'), 'expected a "keys" arg to be derived')
  })

  it('buildCloudRequestParams includes the body for the delete-api-keys DELETE request', async () => {
    const def = await findDef('delete-api-keys')
    const parsed: ParsedResult = { options: {}, input: { keys: ['k1', 'k2'] } }
    const result = buildCloudRequestParams(def, parsed)
    assert.equal(result.method, 'DELETE')
    assert.deepEqual(result.body, { keys: ['k1', 'k2'] })
  })

  it('resolves properties for a POST-body root-$ref command too (create-extension)', async () => {
    const def = await findDef('create-extension')
    const schema = buildCloudJsonSchema(def)
    const props = schema['properties'] as Record<string, unknown>
    assert.ok(Object.keys(props).length > 0, 'expected non-empty properties for create-extension')
    assert.ok('name' in props, 'expected "name" field on create-extension body')
  })

  it('names the unknown field when all required fields are present (additionalProperties)', async () => {
    const def = await findDef('delete-api-keys')
    const schema = buildCloudJsonSchema(def)
    const result = validateWithJsonSchema(schema, { keys: ['k1'], bogus: 1 })
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(
        result.errors.some((e) => e.code === 'additionalProperties' && e.message.includes('bogus')),
        `expected an error naming "bogus", got ${JSON.stringify(result.errors)}`
      )
    }
  })

  it('rejects {"bogus":1} and missing required "keys" with a structured validation error', async () => {
    const def = await findDef('delete-api-keys')
    const schema = buildCloudJsonSchema(def)
    const result = validateWithJsonSchema(schema, { bogus: 1 })
    assert.equal(result.success, false)
    if (!result.success) {
      assert.ok(result.errors.length > 0)
    }
  })
})
