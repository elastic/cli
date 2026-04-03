/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { buildRequestParams } from '../../src/es/request-builder.ts'
import type { ParsedResult } from '../../src/factory.ts'

function makeDefinition(overrides: Partial<EsApiDefinition> = {}): EsApiDefinition {
  return {
    name: 'health',
    namespace: 'cat',
    description: 'Returns cluster health',
    method: 'GET',
    path: '/_cat/health',
    ...overrides,
  }
}

function parsedResult(input: Record<string, unknown> = {}): ParsedResult {
  return { options: {}, input }
}

describe('buildRequestParams', () => {
  it('returns correct method and static path', () => {
    const def = makeDefinition()
    const result = buildRequestParams(def, parsedResult())
    assert.equal(result.method, 'GET')
    assert.equal(result.path, '/_cat/health')
  })

  it('interpolates a required path parameter from parsed.input', () => {
    const def = makeDefinition({
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
    })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }))
    assert.equal(result.path, '/my-index')
  })

  it('interpolates multiple path parameters from parsed.input', () => {
    const def = makeDefinition({
      path: '/{index}/_alias/{name}',
      pathParams: [
        { name: 'index', description: 'Index name', required: true },
        { name: 'name', description: 'Alias name', required: true },
      ],
    })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', name: 'logs-alias' }))
    assert.equal(result.path, '/logs/_alias/logs-alias')
  })

  it('omits optional path parameters when not present in parsed.input', () => {
    const def = makeDefinition({
      path: '/_cat/shards/{index}',
      pathParams: [{ name: 'index', description: 'Index filter', required: false }],
    })
    const result = buildRequestParams(def, parsedResult())
    assert.equal(result.path, '/_cat/shards')
  })

  it('assembles query string from queryParam keys in parsed.input', () => {
    const def = makeDefinition({
      queryParams: [
        { name: 'v', type: 'boolean', description: 'Verbose' },
        { name: 'format', type: 'string', description: 'Format' },
      ],
    })
    const result = buildRequestParams(def, parsedResult({ v: true, format: 'json' }))
    assert.deepEqual(result.querystring, { v: true, format: 'json' })
  })

  it('uses the ES param name as the querystring key when cliFlag input is provided', () => {
    const def = makeDefinition({
      queryParams: [
        { name: 'format', cliFlag: 'response-format', type: 'string', description: 'Format' },
      ],
    })
    const result = buildRequestParams(def, parsedResult({ 'response-format': 'json' }))
    assert.deepEqual(result.querystring, { format: 'json' })
  })

  it('omits queryParams absent from parsed.input', () => {
    const def = makeDefinition({
      queryParams: [
        { name: 'v', type: 'boolean', description: 'Verbose' },
        { name: 'h', type: 'string', description: 'Headers' },
      ],
    })
    const result = buildRequestParams(def, parsedResult({ v: true }))
    assert.deepEqual(result.querystring, { v: true })
  })

  it('collects body fields from top-level keys in parsed.input', () => {
    const def = makeDefinition({
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      body: z.object({ settings: z.record(z.string(), z.unknown()) }),
    })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', settings: { number_of_shards: 1 } }))
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('combines path interpolation, querystring, and body fields all from parsed.input', () => {
    const def = makeDefinition({
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      queryParams: [{ name: 'master_timeout', type: 'string', description: 'Timeout' }],
      body: z.object({ settings: z.record(z.string(), z.unknown()) }),
    })
    const result = buildRequestParams(def, parsedResult({
      index: 'my-index',
      master_timeout: '30s',
      settings: { number_of_shards: 1 },
    }))
    assert.equal(result.method, 'PUT')
    assert.equal(result.path, '/my-index')
    assert.deepEqual(result.querystring, { master_timeout: '30s' })
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('returns undefined body when no body schema is defined', () => {
    const def = makeDefinition()
    const result = buildRequestParams(def, parsedResult())
    assert.equal(result.body, undefined)
  })

  it('returns undefined body when body schema is present but no body fields are provided', () => {
    const def = makeDefinition({
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      body: z.object({ settings: z.record(z.string(), z.unknown()).optional() }),
    })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }))
    assert.equal(result.body, undefined)
  })

  it('does not leak path/query param keys into the body', () => {
    const def = makeDefinition({
      method: 'GET',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      queryParams: [{ name: 'v', type: 'boolean', description: 'Verbose' }],
    })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', v: true }))
    assert.equal(result.body, undefined)
  })
})
