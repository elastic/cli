/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition, HttpMethod } from '../../src/es/types.ts'
import { validateApiDefinition } from '../../src/es/types.ts'

describe('EsApiDefinition types', () => {
  it('accepts a minimal valid definition', () => {
    const def: EsApiDefinition = {
      name: 'health',
      namespace: 'cat',
      description: 'Returns cluster health',
      method: 'GET',
      path: '/_cat/health',
    }
    assert.equal(def.name, 'health')
    assert.equal(def.namespace, 'cat')
    assert.equal(def.method, 'GET')
    assert.equal(def.path, '/_cat/health')
    assert.equal(def.input, undefined)
    assert.equal(def.responseType, undefined)
  })

  it('accepts a full definition with input schema and responseType', () => {
    const def: EsApiDefinition = {
      name: 'create',
      namespace: 'indices',
      description: 'Creates an index',
      method: 'PUT',
      path: '/{index}',
      input: z.looseObject({
        index: z.string().describe('Index name').meta({ found_in: 'path' }),
        wait_for_active_shards: z.string().optional().describe('Wait for shards').meta({ found_in: 'query' }),
        settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
      }),
      responseType: 'json',
    }
    assert.equal(def.name, 'create')
    assert.ok(def.input != null)
    assert.equal(def.responseType, 'json')
  })
})

  it('accepts a definition without namespace (flat command, no group nesting)', () => {
    const def: EsApiDefinition = {
      name: 'search',
      description: 'Run a search',
      method: 'GET',
      path: '/_search',
    }
    assert.equal(def.name, 'search')
    assert.equal(def.namespace, undefined)
  })
describe('HttpMethod', () => {
  it('is a union of the five valid HTTP methods', () => {
    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']
    assert.equal(methods.length, 5)
  })
})

describe('validateApiDefinition', () => {
  function validBase(): EsApiDefinition {
    return {
      name: 'health',
      namespace: 'cat',
      description: 'Returns cluster health',
      method: 'GET',
      path: '/_cat/health',
    }
  }

  it('passes a valid minimal definition without throwing', () => {
    assert.doesNotThrow(() => validateApiDefinition(validBase()))
  })

  it('passes a definition with matching path param in input schema', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}/_cat/health',
      input: z.looseObject({
        index: z.string().describe('Index').meta({ found_in: 'path' }),
      }),
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })

  it('passes a definition without namespace', () => {
    const def: EsApiDefinition = {
      name: 'search',
      description: 'Run a search',
      method: 'GET',
      path: '/_search',
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })

  it('rejects a namespace with invalid characters when namespace is present', () => {
    const def = { ...validBase(), namespace: 'My_Namespace' }
    assert.throws(() => validateApiDefinition(def), /invalid.*namespace/i)
  })

  it('rejects a name with invalid characters', () => {
    const def = { ...validBase(), name: 'Health_Check' }
    assert.throws(() => validateApiDefinition(def), /invalid.*name/i)
  })

  it('rejects a name that starts with a hyphen', () => {
    const def = { ...validBase(), name: '-health' }
    assert.throws(() => validateApiDefinition(def), /invalid.*name/i)
  })
  it('rejects a path that does not start with /', () => {
    const def = { ...validBase(), path: '_cat/health' }
    assert.throws(() => validateApiDefinition(def), /path.*must start/i)
  })

  it('rejects a path token with no corresponding found_in: "path" field in input', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}/_cat/health',
      input: z.looseObject({
        index: z.string().meta({ found_in: 'query' }),
      }),
    }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index|index.*found_in.*path/i)
  })

  it('rejects a path token when input has no fields at all', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}',
      input: z.looseObject({}),
    }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index/i)
  })

  it('rejects a found_in: "path" field with no matching {token} in path', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/_cat/health',
      input: z.looseObject({
        index: z.string().meta({ found_in: 'path' }),
      }),
    }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index|found_in.*path.*no.*token/i)
  })

  it('allows an optional found_in: "path" field if it has a {token} in path', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/_cat/shards/{index}',
      input: z.looseObject({
        index: z.string().optional().meta({ found_in: 'path' }),
      }),
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })
})

describe('validateApiDefinition -- unified input schema', () => {
  function validBase(): EsApiDefinition {
    return {
      name: 'health',
      namespace: 'cat',
      description: 'Returns cluster health',
      method: 'GET',
      path: '/_cat/health',
    }
  }

  it('passes a valid definition with an input schema', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}',
      input: z.looseObject({
        index: z.string().describe('Target index').meta({ found_in: 'path' }),
        pretty: z.boolean().optional().meta({ found_in: 'query' }),
      }),
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })

  it('rejects a definition where {param} token in path has no found_in: "path" field', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}',
      input: z.looseObject({
        index: z.string().meta({ found_in: 'query' }),
      }),
    }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index|index.*found_in.*path/i)
  })

  it('rejects a definition where a found_in: "path" field has no matching {param} in path', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/_cat/health',
      input: z.looseObject({
        index: z.string().meta({ found_in: 'path' }),
      }),
    }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index|found_in.*path.*no.*token/i)
  })
})
