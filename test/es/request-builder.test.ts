/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { buildRequestParams } from '../../src/es/request-builder.ts'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'
import type { ParsedResult } from '../../src/factory.ts'

function makeDefinition (overrides: Partial<EsApiDefinition> = {}): EsApiDefinition {
  return {
    name: 'health',
    namespace: 'cat',
    description: 'Returns cluster health',
    method: 'GET',
    path: '/_cat/health',
    ...overrides,
  }
}

function parsedResult (input: Record<string, unknown> = {}): ParsedResult {
  return { options: {}, input }
}

/** Build a JSON Schema from a flat properties map for test convenience. */
function schema (
  properties: Record<string, Record<string, unknown>>,
  required: string[] = []
): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

/** Extract schema args from a JSON Schema (same helper signature as before, but no Zod). */
function args (s: Record<string, unknown>) {
  return extractSchemaArgs(s)
}

describe('buildRequestParams', () => {
  it('returns correct method and static path', () => {
    const def = makeDefinition()
    const result = buildRequestParams(def, parsedResult(), [])
    assert.equal(result.method, 'GET')
    assert.equal(result.path, '/_cat/health')
  })

  it('interpolates a required path parameter from parsed.input', () => {
    const input = schema(
      { index: { type: 'string', description: 'Index name', 'x-found-in': 'path' } },
      ['index']
    )
    const def = makeDefinition({ path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }), args(input))
    assert.equal(result.path, '/my-index')
  })

  it('interpolates multiple path parameters from parsed.input', () => {
    const input = schema(
      {
        index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
        name: { type: 'string', description: 'Alias name', 'x-found-in': 'path' },
      },
      ['index', 'name']
    )
    const def = makeDefinition({ path: '/{index}/_alias/{name}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', name: 'logs-alias' }), args(input))
    assert.equal(result.path, '/logs/_alias/logs-alias')
  })

  it('omits optional path parameters when not present in parsed.input', () => {
    const input = schema({
      index: { type: 'string', description: 'Index filter', 'x-found-in': 'path' },
    })
    const def = makeDefinition({ path: '/_cat/shards/{index}', input })
    const result = buildRequestParams(def, parsedResult(), args(input))
    assert.equal(result.path, '/_cat/shards')
  })

  it('assembles query string from query-routed fields in parsed.input', () => {
    const input = schema({
      v: { type: 'boolean', description: 'Verbose', 'x-found-in': 'query' },
      format: { type: 'string', description: 'Format', 'x-found-in': 'query' },
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ v: true, format: 'json' }), args(input))
    assert.deepEqual(result.querystring, { v: true, format: 'json' })
  })

  it('uses the schema key (snake_case) as the ES querystring param name', () => {
    const input = schema({
      master_timeout: { type: 'string', description: 'Master node timeout', 'x-found-in': 'query' },
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ master_timeout: '30s' }), args(input))
    assert.deepEqual(result.querystring, { master_timeout: '30s' })
  })

  it('omits query params absent from parsed.input', () => {
    const input = schema({
      v: { type: 'boolean', description: 'Verbose', 'x-found-in': 'query' },
      h: { type: 'string', description: 'Headers', 'x-found-in': 'query' },
    })
    const def = makeDefinition({ input })
    const result = buildRequestParams(def, parsedResult({ v: true }), args(input))
    assert.deepEqual(result.querystring, { v: true })
  })

  it('collects body fields from top-level keys in parsed.input', () => {
    const input = schema(
      {
        index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
        settings: { type: 'object', description: 'Settings', 'x-found-in': 'body' },
      },
      ['index']
    )
    const def = makeDefinition({ method: 'PUT', path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', settings: { number_of_shards: 1 } }), args(input))
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('combines path interpolation, querystring, and body fields all from parsed.input', () => {
    const input = schema(
      {
        index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
        master_timeout: { type: 'string', description: 'Timeout', 'x-found-in': 'query' },
        settings: { type: 'object', description: 'Settings', 'x-found-in': 'body' },
      },
      ['index']
    )
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
    const input = schema({
      index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
      settings: { type: 'object', description: 'Settings', 'x-found-in': 'body' },
    }, ['index'])
    const def = makeDefinition({ method: 'PUT', path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'my-index' }), args(input))
    assert.equal(result.body, undefined)
  })

  it('does not leak path/query param keys into the body', () => {
    const input = schema({
      index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
      v: { type: 'boolean', description: 'Verbose', 'x-found-in': 'query' },
    }, ['index'])
    const def = makeDefinition({ path: '/{index}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'logs', v: true }), args(input))
    assert.equal(result.body, undefined)
  })

  it('defaults params without found_in metadata to body', () => {
    const input = schema({
      mappings: { type: 'object', description: 'Mappings' },
    })
    const def = makeDefinition({ method: 'PUT', input })
    const result = buildRequestParams(def, parsedResult({ mappings: { dynamic: false } }), args(input))
    assert.deepEqual(result.body, { mappings: { dynamic: false } })
  })

  it('works with x-found-in at property level', () => {
    const input = schema({
      index: { type: 'string', 'x-found-in': 'path' },
      pretty: { type: 'boolean', 'x-found-in': 'query' },
    }, ['index'])
    const def = makeDefinition({ path: '/{index}', input })
    const schemaArgs = extractSchemaArgs(input)
    const result = buildRequestParams(def, parsedResult({ index: 'logs', pretty: true }), schemaArgs)
    assert.equal(result.path, '/logs')
    assert.deepEqual(result.querystring, { pretty: true })
  })

  it('encodes path params to prevent path traversal (#106)', () => {
    const input = schema({ index: { type: 'string', description: 'Index', 'x-found-in': 'path' } }, ['index'])
    const def = makeDefinition({ path: '/{index}/_search', input })
    const result = buildRequestParams(def, parsedResult({ index: '_cluster/health?#' }), args(input))
    assert.ok(!result.path.includes('_cluster/health'), 'slash must be encoded to prevent traversal')
    assert.ok(!result.path.includes('?'), 'question mark must be encoded')
    assert.ok(!result.path.includes('#'), 'hash must be encoded')
    assert.equal(result.path, '/_cluster%2Fhealth%3F%23/_search')
  })

  it('preserves comma-separated multi-index values after encoding', () => {
    const input = schema({ index: { type: 'string', description: 'Index', 'x-found-in': 'path' } }, ['index'])
    const def = makeDefinition({ path: '/{index}/_search', input })
    const result = buildRequestParams(def, parsedResult({ index: 'idx1, idx2' }), args(input))
    assert.equal(result.path, '/idx1,idx2/_search')
  })

  for (const widening of ['', '.', '..']) {
    it(`rejects a path param of ${JSON.stringify(widening)} instead of silently widening the request scope (#499)`, () => {
      const input = schema({ index: { type: 'string', description: 'Index', 'x-found-in': 'path' } }, ['index'])
      const def = makeDefinition({ path: '/{index}/_search', input })
      try {
        buildRequestParams(def, parsedResult({ index: widening }), args(input))
        assert.fail('expected buildRequestParams to throw')
      } catch (err) {
        assert.equal((err as { code?: string }).code, 'input_error')
      }
    })
  }

  it('rejects a widening segment inside a comma-separated multi-target value', () => {
    const input = schema({ index: { type: 'string', description: 'Index', 'x-found-in': 'path' } }, ['index'])
    const def = makeDefinition({ path: '/{index}/_search', input })
    assert.throws(
      () => buildRequestParams(def, parsedResult({ index: 'idx1,..' }), args(input)),
      (err: unknown) => (err as { code?: string }).code === 'input_error'
    )
  })

  it('promotes an "x-body-root" field to be the entire body (#95)', () => {
    const input = schema({
      index: { type: 'string', description: 'Index', 'x-found-in': 'path' },
      document: { type: 'object', description: 'Document', 'x-found-in': 'body', 'x-body-root': true },
    }, ['index'])
    const def = makeDefinition({ method: 'PUT', path: '/{index}/_doc', input })
    const doc = { title: 'Hello', count: 42 }
    const result = buildRequestParams(def, parsedResult({ index: 'my-index', document: doc }), args(input))
    assert.deepEqual(result.body, { title: 'Hello', count: 42 }, 'document value should be the body itself, not nested')
  })

  it('does not promote body fields without "x-body-root"', () => {
    const input = schema({
      settings: { type: 'object', description: 'Settings', 'x-found-in': 'body' },
    })
    const def = makeDefinition({ method: 'PUT', input })
    const result = buildRequestParams(def, parsedResult({ settings: { number_of_shards: 1 } }), args(input))
    assert.deepEqual(result.body, { settings: { number_of_shards: 1 } })
  })

  it('promotes any upstream-marked root field, not just a hard-coded name list', () => {
    const input = schema({
      search_application: { type: 'object', description: 'App', 'x-found-in': 'body', 'x-body-root': true },
    })
    const def = makeDefinition({ method: 'PUT', path: '/_application/search_application', input })
    const result = buildRequestParams(def, parsedResult({ search_application: { indices: ['a'] } }), args(input))
    assert.deepEqual(result.body, { indices: ['a'] })
  })

  it('does not promote when another body field also has a value', () => {
    const input = schema({
      document: { type: 'object', description: 'Document', 'x-found-in': 'body', 'x-body-root': true },
      refresh: { type: 'string', description: 'Refresh', 'x-found-in': 'body' },
    })
    const def = makeDefinition({ method: 'PUT', input })
    const result = buildRequestParams(def, parsedResult({ document: { a: 1 }, refresh: 'true' }), args(input))
    assert.deepEqual(result.body, { document: { a: 1 }, refresh: 'true' })
  })

  it('skips root promotion for NDJSON bodies so the array still serializes per line', () => {
    const input = schema({
      operations: { type: 'array', description: 'Operations', 'x-found-in': 'body', 'x-body-root': true },
    })
    const ops = [{ index: { _id: '1' } }, { title: 'Doc 1' }]
    const def = makeDefinition({ method: 'POST', input, bodyFormat: 'ndjson' })
    const result = buildRequestParams(def, parsedResult({ operations: ops }), args(input))
    assert.equal(result.bulkBody, '{"index":{"_id":"1"}}\n{"title":"Doc 1"}\n')
    assert.equal(result.body, undefined)
  })


  it('serializes body as NDJSON via bulkBody when bodyFormat is "ndjson" (#94)', () => {
    const input = schema({
      operations: { type: 'array', description: 'Operations', 'x-found-in': 'body' },
    })
    const ops = [{ index: { _id: '1' } }, { title: 'Doc 1' }]
    const def = makeDefinition({ method: 'POST', input, bodyFormat: 'ndjson' })
    const result = buildRequestParams(def, parsedResult({ operations: ops }), args(input))
    assert.equal(result.bulkBody, '{"index":{"_id":"1"}}\n{"title":"Doc 1"}\n')
    assert.equal(result.body, undefined, 'body should not be set for NDJSON')
  })

  it('switches from PUT to POST when an optional path param like {id} is absent (#168)', () => {
    const input = schema({
      index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
      id: { type: 'string', description: 'Document ID', 'x-found-in': 'path' },
      document: { type: 'object', description: 'Document', 'x-found-in': 'body' },
    }, ['index'])
    const def = makeDefinition({ method: 'PUT', path: '/{index}/_doc/{id}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'test-index', document: { title: 'hello' } }), args(input))
    assert.equal(result.method, 'POST', 'should use POST when id is absent')
    assert.equal(result.path, '/test-index/_doc')
  })

  it('keeps PUT when the optional {id} path param is provided', () => {
    const input = schema({
      index: { type: 'string', description: 'Index name', 'x-found-in': 'path' },
      id: { type: 'string', description: 'Document ID', 'x-found-in': 'path' },
      document: { type: 'object', description: 'Document', 'x-found-in': 'body' },
    }, ['index'])
    const def = makeDefinition({ method: 'PUT', path: '/{index}/_doc/{id}', input })
    const result = buildRequestParams(def, parsedResult({ index: 'test-index', id: 'doc1', document: { title: 'hello' } }), args(input))
    assert.equal(result.method, 'PUT', 'should keep PUT when id is provided')
    assert.equal(result.path, '/test-index/_doc/doc1')
  })

  it('NDJSON format applies to msearch searches field', () => {
    const input = schema({
      searches: { type: 'array', description: 'Searches', 'x-found-in': 'body' },
    })
    const items = [{ index: 'my-index' }, { query: { match_all: {} } }]
    const def = makeDefinition({ method: 'GET', input, bodyFormat: 'ndjson' })
    const result = buildRequestParams(def, parsedResult({ searches: items }), args(input))
    assert.equal(result.bulkBody, '{"index":"my-index"}\n{"query":{"match_all":{}}}\n')
  })
})
