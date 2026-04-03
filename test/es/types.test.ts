/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition, EsPathParam, EsQueryParam, HttpMethod } from '../../src/es/types.ts'
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
    assert.equal(def.pathParams, undefined)
    assert.equal(def.queryParams, undefined)
    assert.equal(def.body, undefined)
    assert.equal(def.responseType, undefined)
  })

  it('accepts a full definition with all optional fields', () => {
    const body = z.object({ settings: z.record(z.string(), z.unknown()) })
    const def: EsApiDefinition = {
      name: 'create',
      namespace: 'indices',
      description: 'Creates an index',
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      queryParams: [
        { name: 'wait_for_active_shards', type: 'string', description: 'Wait for shards' },
      ],
      body,
      responseType: 'json',
    }
    assert.equal(def.name, 'create')
    assert.ok(def.pathParams != null && def.pathParams.length === 1)
    assert.ok(def.queryParams != null && def.queryParams.length === 1)
    assert.ok(def.body != null)
    assert.equal(def.responseType, 'json')
  })
})

describe('EsPathParam', () => {
  it('has correct shape', () => {
    const param: EsPathParam = {
      name: 'index',
      description: 'Index name',
      required: true,
    }
    assert.equal(param.name, 'index')
    assert.equal(param.description, 'Index name')
    assert.equal(param.required, true)
  })
})

describe('EsQueryParam', () => {
  it('accepts cliFlag override', () => {
    const param: EsQueryParam = {
      name: 'format',
      cliFlag: 'response-format',
      type: 'string',
      description: 'Response format',
    }
    assert.equal(param.name, 'format')
    assert.equal(param.cliFlag, 'response-format')
    assert.equal(param.type, 'string')
  })
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

  it('passes a definition with matching pathParams', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}/_cat/health',
      pathParams: [{ name: 'index', description: 'Index', required: true }],
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })

  it('rejects a name with invalid characters', () => {
    const def = { ...validBase(), name: 'Health_Check' }
    assert.throws(() => validateApiDefinition(def), /invalid.*name/i)
  })

  it('rejects a name that starts with a hyphen', () => {
    const def = { ...validBase(), name: '-health' }
    assert.throws(() => validateApiDefinition(def), /invalid.*name/i)
  })

  it('rejects a namespace with invalid characters', () => {
    const def = { ...validBase(), namespace: 'My_Namespace' }
    assert.throws(() => validateApiDefinition(def), /invalid.*namespace/i)
  })

  it('rejects a path that does not start with /', () => {
    const def = { ...validBase(), path: '_cat/health' }
    assert.throws(() => validateApiDefinition(def), /path.*must start/i)
  })

  it('rejects a path param token with no corresponding pathParams entry', () => {
    const def: EsApiDefinition = { ...validBase(), path: '/{index}/_cat/health' }
    assert.throws(() => validateApiDefinition(def), /path.*param.*index.*not.*defined|missing.*pathParam/i)
  })

  it('rejects a required pathParam with no corresponding {token} in path', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/_cat/health',
      pathParams: [{ name: 'index', description: 'Index', required: true }],
    }
    assert.throws(() => validateApiDefinition(def), /pathParam.*index.*not.*path|required.*pathParam.*not in path/i)
  })

  it('allows an optional pathParam with no corresponding {token} in path', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/_cat/health',
      pathParams: [{ name: 'index', description: 'Index', required: false }],
    }
    assert.doesNotThrow(() => validateApiDefinition(def))
  })

  it('rejects a definition where a body field name collides with a path param schema key', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index', required: true }],
      body: z.object({ index: z.string().optional().describe('An index field in the body') }),
    }
    assert.throws(() => validateApiDefinition(def), /schema key collision.*index|index.*collision/i)
  })

  it('rejects a definition where a body field name collides with a query param schema key', () => {
    const def: EsApiDefinition = {
      ...validBase(),
      queryParams: [{ name: 'filter', type: 'string', description: 'Filter' }],
      body: z.object({ filter: z.string().optional().describe('A filter in the body') }),
    }
    assert.throws(() => validateApiDefinition(def), /schema key collision.*filter|filter.*collision/i)
  })
})
