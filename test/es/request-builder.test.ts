/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { buildRequestParams } from '../../src/es/request-builder.ts'
import { extractSchemaArgs } from '../../src/lib/schema-args.ts'
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

/** helper: extract schema args from a schema (simulates what registerEsCommands does at registration time) */
function args(schema: z.ZodObject<z.ZodRawShape>) {
  return extractSchemaArgs(schema)
}

describe('buildRequestParams', () => {
  it('returns correct method and static path', () => {
    const def = makeDefinition()
    const result = buildRequestParams(def, parsedResult(), [])
    assert.equal(result.method, 'GET')
    assert.equal(result.path, '/_cat/health')
  })

  it('interpolates a required path parameter from parsed.input', () => {
    const input = z.looseObject({ index: z.string().describe('Index name').meta({ found_in: 'path' }) })
    const def = makeDefinition({ path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }), args(input))
    assert.equal(result.path, '/my-index')
  })

  it('interpolates multiple path parameters from parsed.input', () => {
    const input = z.looseObject({
      index: z.string().describe('Index name').meta({ found_in: 'path' }),
      name: z.string().describe('Alias name').meta({ found_in: 'path' }),
    })
    const def = makeDefinition({ path: '/{index}/_alias/{name}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', name: 'logs-alias' }), args(input))
    assert.equal(result.path, '/logs/_alias/logs-alias')
  })

  it('omits optional path parameters when not present in parsed.input', () => {
    const input = z.looseObject({ index: z.string().optional().describe('Index filter').meta({ found_in: 'path' }) })
    const def = makeDefinition({ path: '/_cat/shards/{index}', input })
    const result = buildRequestParams(def, parsedResult(), args(input))
    assert.equal(result.path, '/_cat/shards')
  })

  it('assembles query string from query-routed fields in parsed.input', () => {
    const input = z.looseObject({
      v: z.boolean().optional().describe('Verbose').meta({ found_in: 'query' }),
      format: z.string().optional().describe('Format').meta({ found_in: 'query' }),
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ v: true, format: 'json' }), args(input))
    assert.deepEqual(result.querystring, { v: true, format: 'json' })
  })

  it('uses the schema key (snake_case) as the ES querystring param name', () => {
    const input = z.looseObject({
      master_timeout: z.string().optional().describe('Master node timeout').meta({ found_in: 'query' }),
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ master_timeout: '30s' }), args(input))
    assert.deepEqual(result.querystring, { master_timeout: '30s' })
  })

  it('omits query params absent from parsed.input', () => {
    const input = z.looseObject({
      v: z.boolean().optional().describe('Verbose').meta({ found_in: 'query' }),
      h: z.string().optional().describe('Headers').meta({ found_in: 'query' }),
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ v: true }), args(input))
    assert.deepEqual(result.querystring, { v: true })
  })

  it('collects body fields from top-level keys in parsed.input', () => {
    const input = z.looseObject({
      index: z.string().describe('Index name').meta({ found_in: 'path' }),
      settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
    })
    const def = makeDefinition({ method: 'PUT', path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', settings: { number_of_shards: 1 } }), args(input))
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('combines path interpolation, querystring, and body fields all from parsed.input', () => {
    const input = z.looseObject({
      index: z.string().describe('Index name').meta({ found_in: 'path' }),
      master_timeout: z.string().optional().describe('Timeout').meta({ found_in: 'query' }),
      settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
    })
    const def = makeDefinition({ method: 'PUT', path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({
      index: 'my-index',
      master_timeout: '30s',
      settings: { number_of_shards: 1 },
    }), args(input))
    assert.equal(result.method, 'PUT')
    assert.equal(result.path, '/my-index')
    assert.deepEqual(result.querystring, { master_timeout: '30s' })
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('returns undefined body when no schema args are provided', () => {
    const def = makeDefinition()
    const result = buildRequestParams(def, parsedResult(), [])
    assert.equal(result.body, undefined)
  })

  it('returns undefined body when body-routed fields are absent from input', () => {
    const input = z.looseObject({
      index: z.string().describe('Index name').meta({ found_in: 'path' }),
      settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
    })
    const def = makeDefinition({ method: 'PUT', path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }), args(input))
    assert.equal(result.body, undefined)
  })

  it('does not leak path/query param keys into the body', () => {
    const input = z.looseObject({
      index: z.string().describe('Index name').meta({ found_in: 'path' }),
      v: z.boolean().optional().describe('Verbose').meta({ found_in: 'query' }),
    })
    const def = makeDefinition({ path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', v: true }), args(input))
    assert.equal(result.body, undefined)
  })

  it('defaults params without found_in metadata to body', () => {
    const input = z.looseObject({ mappings: z.record(z.string(), z.unknown()).optional() })
    const def = makeDefinition({ method: 'PUT', input })
    const result = buildRequestParams(def, parsedResult({ mappings: { dynamic: false } }), args(input))
    assert.deepEqual(result.body, { mappings: { dynamic: false } })
  })

  it('works with meta applied inside .optional() wrapper (defensive traversal)', () => {
    const externalSchema = z.looseObject({
      index: z.string().meta({ found_in: 'path' }),
      pretty: z.boolean().meta({ found_in: 'query' }).optional(),
    })
    const def = makeDefinition({ path: '/{index}', input: externalSchema })
    const schemaArgs = extractSchemaArgs(externalSchema)
    const result = buildRequestParams(def, parsedResult({ index: 'logs', pretty: true }), schemaArgs)
    assert.equal(result.path, '/logs')
    assert.deepEqual(result.querystring, { pretty: true })
  })
})
