/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression coverage for `validateWithJsonSchema` against REAL `@elastic/schemas`
 * documents, not hand-crafted toy schemas.
 *
 * AGENTS.md "Generic Abstractions" lesson 3: hand-crafted schemas miss shapes that
 * only appear in real upstream output. This file loads actual command definitions
 * to exercise each JSON Schema composition shape @elastic/schemas emits: a bare
 * `$ref` property, an `anyOf` union, a multi-branch `oneOf`, a nullable enum with a
 * duplicate `null`, and the flat cloud bodies that used to arrive as a root `$ref`
 * or an `allOf` pair. Kibana's remaining root `$ref`/`allOf` documents are resolved
 * by `flattenComposition` before a definition is returned, so no composite root
 * reaches a caller.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadEsApisInFile } from '../../src/es/apis.ts'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { loadCloudApis } from '../../src/cloud/apis.ts'
import { buildCloudJsonSchema } from '../../src/cloud/types.ts'
import { validateWithJsonSchema } from '../../src/lib/ajv-validate.ts'

/** Finds the root-level `search` definition (namespace-less) from the ES `search` file. */
async function realSearchInput (): Promise<Record<string, unknown>> {
  const defs = await loadEsApisInFile('search')
  const def = defs.find((d) => d.name === 'search' && d.namespace == null)
  assert.ok(def?.input != null, 'expected the real ES "search" definition to have an input schema')
  return def.input
}

async function kbInput (namespace: string, name: string): Promise<Record<string, unknown>> {
  const defs = await loadAllKbApis()
  const def = defs.find((d) => d.namespace === namespace && d.name === name)
  assert.ok(def?.input != null, `expected kb definition ${namespace}/${name} to have an input schema`)
  return def.input
}

describe('real schema shape: bare $ref property (kb fleet-package-policies post-fleet-package-policies)', () => {
  it('accepts a value matching the $ref target', async () => {
    const schema = await kbInput('fleet-package-policies', 'post-fleet-package-policies')
    // "package" is `{ "$ref": "#/$defs/..." }` — no inline type.
    const pkg = (schema['properties'] as Record<string, Record<string, unknown>>)['package']
    assert.equal(pkg?.['$ref'], '#/$defs/Kibana_HTTP_APIs_package_policy_package')
    assert.equal(pkg?.['type'], undefined, 'expected no inline type alongside the $ref')
    const result = validateWithJsonSchema(schema, { name: 'p1', package: { name: 'nginx', version: '1.0.0' } })
    assert.equal(result.success, true)
  })

  it('rejects a value that violates the $ref target with one clean issue', async () => {
    const schema = await kbInput('fleet-package-policies', 'post-fleet-package-policies')
    const result = validateWithJsonSchema(schema, { name: 'p1', package: 'not-an-object' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.equal(result.errors.length, 1, `expected one issue, got: ${JSON.stringify(result.errors)}`)
    assert.equal(result.errors[0]!.code, 'type')
    assert.deepEqual(result.errors[0]!.path_array, ['package'])
  })
})

describe('real schema shape: flat root body (cloud delete-api-keys)', () => {
  it('accepts a value matching the resolved root schema', async () => {
    const defs = await loadCloudApis()
    const def = defs.find((d) => d.name === 'delete-api-keys')
    assert.ok(def != null, 'expected cloud "delete-api-keys" definition')
    // Upstream used to ship this as a root `$ref` document; since the JSON Schema
    // generation change it is a flat object. `resolveRootRef` is kept as the loud
    // guard for the shape and is covered by test/lib/json-schema-refs.test.ts.
    assert.deepEqual(Object.keys(def.input['properties'] as Record<string, unknown>), ['keys'])
    const schema = buildCloudJsonSchema(def)
    const result = validateWithJsonSchema(schema, { keys: ['k1', 'k2'] })
    assert.equal(result.success, true)
  })

  it('rejects a bad value with one clean issue', async () => {
    const defs = await loadCloudApis()
    const def = defs.find((d) => d.name === 'delete-api-keys')
    assert.ok(def != null)
    const schema = buildCloudJsonSchema(def)
    const result = validateWithJsonSchema(schema, { keys: 'not-an-array' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.equal(result.errors.length, 1, `expected one issue, got: ${JSON.stringify(result.errors)}`)
    assert.equal(result.errors[0]!.code, 'type')
    assert.deepEqual(result.errors[0]!.path_array, ['keys'])
  })
})

describe('real schema shape: previously allOf-composed body (cloud create-deployment)', () => {
  it('accepts fields that upstream used to split across the root and an allOf $ref', async () => {
    const defs = await loadCloudApis()
    const def = defs.find((d) => d.name === 'create-deployment')
    assert.ok(def != null, 'expected cloud "create-deployment" definition')
    const props = def.input['properties'] as Record<string, unknown>
    for (const key of ['request_id', 'name']) {
      assert.ok(key in props, `expected "${key}" to be a flat root property`)
    }
    // "request_id" is a root property; "name" only exists inside the allOf $ref target.
    const result = validateWithJsonSchema(def.input, { request_id: 'abc', name: 'my-deployment' })
    assert.equal(result.success, true)
  })

  it('rejects a bad allOf-merged field with one clean issue', async () => {
    const defs = await loadCloudApis()
    const def = defs.find((d) => d.name === 'create-deployment')
    assert.ok(def != null)
    const result = validateWithJsonSchema(def.input, { name: 42 })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.equal(result.errors.length, 1, `expected one issue, got: ${JSON.stringify(result.errors)}`)
    assert.equal(result.errors[0]!.code, 'type')
    assert.deepEqual(result.errors[0]!.path_array, ['name'])
  })
})

describe('real schema shape: nullable enum with duplicate null (kb alerting post-alerting-rule-id notify_when)', () => {
  const validBase = {
    id: 'r1',
    consumer: 'alerts',
    schedule: { interval: '1m' },
    rule_type_id: 't',
    name: 'r',
  }

  it('is modelled as an enum that includes `null`', async () => {
    const schema = await kbInput('alerting', 'post-alerting-rule-id')
    const notifyWhen = (schema['properties'] as Record<string, Record<string, unknown>>)['notify_when']
    const values = notifyWhen?.['enum'] as unknown[]
    for (const v of ['onActionGroupChange', 'onActiveAlert', 'onThrottleInterval', null]) {
      assert.ok(values.includes(v), `expected enum to include ${String(v)}`)
    }
  })

  it('accepts a listed enum value', async () => {
    const schema = await kbInput('alerting', 'post-alerting-rule-id')
    const result = validateWithJsonSchema(schema, { ...validBase, notify_when: 'onActiveAlert' })
    assert.equal(result.success, true)
  })

  it('accepts null', async () => {
    const schema = await kbInput('alerting', 'post-alerting-rule-id')
    const result = validateWithJsonSchema(schema, { ...validBase, notify_when: null })
    assert.equal(result.success, true)
  })

  it('rejects an unlisted value with one clean issue', async () => {
    const schema = await kbInput('alerting', 'post-alerting-rule-id')
    const result = validateWithJsonSchema(schema, { ...validBase, notify_when: 'bogus' })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.equal(result.errors.length, 1, `expected one issue, got: ${JSON.stringify(result.errors)}`)
    assert.equal(result.errors[0]!.code, 'enum')
    assert.deepEqual(result.errors[0]!.path_array, ['notify_when'])
  })
})

describe('real schema shape: anyOf union (es search _source, boolean | SourceFilter)', () => {
  it('accepts a boolean', async () => {
    const schema = await realSearchInput()
    const result = validateWithJsonSchema(schema, { _source: true })
    assert.equal(result.success, true)
  })

  it('accepts an object matching the other branch', async () => {
    const schema = await realSearchInput()
    const result = validateWithJsonSchema(schema, { _source: { includes: ['field'] } })
    assert.equal(result.success, true)
  })

  it('rejects a value matching neither anyOf branch — KNOWN GAP: not collapsed to one issue', async () => {
    // Known gap, not fixed here: `_source` is a union (`anyOf`) and AJV's
    // allErrors mode reports one error per branch instead of one collapsed
    // issue. Real Elasticsearch accepts shapes the schema may not model, so
    // callers can get multiple confusing errors. Assertions avoid pinning the
    // branch set, which upstream changes.
    const schema = await realSearchInput()
    // A number is outside every branch the schema could plausibly model for `_source`.
    const result = validateWithJsonSchema(schema, { _source: 12345 })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.ok(result.errors.length > 0)
    for (const e of result.errors) assert.deepEqual(e.path_array, ['_source'])
  })
})

describe('real schema shape: multi-branch oneOf (kb agent-builder post-agent-builder-converse prompts)', () => {
  it('accepts a value matching the first branch', async () => {
    const schema = await kbInput('agent-builder', 'post-agent-builder-converse')
    const result = validateWithJsonSchema(schema, { prompts: { p1: { allow: true } } })
    assert.equal(result.success, true)
  })

  it('accepts a value matching a different branch', async () => {
    const schema = await kbInput('agent-builder', 'post-agent-builder-converse')
    const result = validateWithJsonSchema(schema, { prompts: { p1: { answers: [] } } })
    assert.equal(result.success, true)
  })

  it('rejects a value matching no branch — KNOWN GAP: multi-variant explosion, same class as #172', async () => {
    // Known gap, not fixed here: #172 was resolved for ES's Zod-union query
    // fields by remodelling them as `type: object`. `prompts` is a genuine
    // multi-branch union straight from the Kibana schema, so AJV's allErrors
    // mode can report one error per branch plus a root union error, and the
    // #172 guarantee does not hold generically. Assertions avoid pinning the
    // branch count or union keyword, which upstream changes.
    const schema = await kbInput('agent-builder', 'post-agent-builder-converse')
    const result = validateWithJsonSchema(schema, { prompts: { p1: { bogus: true } } })
    assert.equal(result.success, false)
    assert.ok(!result.success)
    assert.ok(result.errors.length > 0)
    for (const e of result.errors) {
      assert.deepEqual(e.path_array.slice(0, 2), ['prompts', 'p1'])
    }
  })
})
