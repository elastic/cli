/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { buildActionMap, mapAction } from '../mapper.ts'
import type { EsApiDefinition } from '../../../src/es/types.ts'

const testDefs: EsApiDefinition[] = [
  {
    name: 'create',
    namespace: 'indices',
    description: 'Create an index',
    method: 'PUT',
    path: '/{index}',
    input: z.object({
      index: z.string().meta({ found_in: 'path' }),
      wait_for_active_shards: z.string().optional().meta({ found_in: 'query' }),
      settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' })
    })
  },
  {
    name: 'get',
    description: 'Get a document',
    method: 'GET',
    path: '/{index}/_doc/{id}',
    input: z.object({
      id: z.string().meta({ found_in: 'path' }),
      index: z.string().meta({ found_in: 'path' }),
      refresh: z.boolean().optional().meta({ found_in: 'query' })
    })
  },
  {
    name: 'info',
    description: 'Get cluster info',
    method: 'GET',
    path: '/'
  }
]

describe('buildActionMap', () => {
  it('maps namespaced actions as namespace.name', () => {
    const map = buildActionMap(testDefs)
    assert.ok(map.has('indices.create'))
    assert.equal(map.get('indices.create')?.name, 'create')
  })

  it('maps root actions as just name', () => {
    const map = buildActionMap(testDefs)
    assert.ok(map.has('get'))
    assert.equal(map.get('get')?.name, 'get')
  })
})

describe('mapAction', () => {
  const actionMap = buildActionMap(testDefs)

  it('maps namespaced action to CLI args', () => {
    const result = mapAction('indices.create', { index: 'test' }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'indices', 'create', '--index', 'test'])
  })

  it('maps root action to CLI args', () => {
    const result = mapAction('get', { index: 'test', id: '1' }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'get', '--index', 'test', '--id', '1'])
  })

  it('includes body fields in CLI args when passed as params', () => {
    const result = mapAction('indices.create', { index: 'test', settings: { number_of_shards: 1 } }, actionMap)
    assert.ok(result)
    assert.ok(result.cliArgs.includes('--settings'))
    assert.equal(result.hasBody, true)
  })

  it('skips ignore param', () => {
    const result = mapAction('indices.create', { index: 'test', ignore: 404 }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'indices', 'create', '--index', 'test'])
  })

  it('returns null for unknown actions', () => {
    const result = mapAction('unknown.action', {}, actionMap)
    assert.equal(result, null)
  })

  it('handles actions without input schema', () => {
    const result = mapAction('info', {}, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'info'])
    assert.equal(result.hasBody, false)
  })

  it('converts snake_case params to kebab-case flags', () => {
    const result = mapAction('indices.create', { index: 'test', wait_for_active_shards: '1' }, actionMap)
    assert.ok(result)
    assert.ok(result.cliArgs.includes('--wait-for-active-shards'))
  })
})
