/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildActionMap, mapAction } from '../mapper.ts'
import type { EsApiDefinition } from '../../../src/es/types.ts'

const testDefs: EsApiDefinition[] = [
  {
    name: 'create',
    namespace: 'indices',
    description: 'Create an index',
    method: 'PUT',
    path: '/{index}',
    input: {
      type: 'object',
      properties: {
        index: { type: 'string', 'x-found-in': 'path' },
        wait_for_active_shards: { type: 'string', 'x-found-in': 'query' },
        settings: { type: 'object', 'x-found-in': 'body' },
      },
      required: ['index'],
    }
  },
  {
    name: 'get',
    description: 'Get a document',
    method: 'GET',
    path: '/{index}/_doc/{id}',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', 'x-found-in': 'path' },
        index: { type: 'string', 'x-found-in': 'path' },
        refresh: { type: 'boolean', 'x-found-in': 'query' },
      },
      required: ['id', 'index'],
    }
  },
  {
    name: 'info',
    description: 'Get cluster info',
    method: 'GET',
    path: '/'
  },
  {
    name: 'delete',
    namespace: 'indices',
    description: 'Delete an index',
    method: 'DELETE',
    path: '/{index}',
    input: {
      type: 'object',
      properties: {
        index: { type: 'string', 'x-found-in': 'path' },
      },
      required: ['index'],
    }
  },
  {
    name: 'forcemerge',
    namespace: 'indices',
    description: 'Force merge an index',
    method: 'POST',
    path: '/{index}/_forcemerge',
    intent: { destructive: true },
    input: {
      type: 'object',
      properties: {
        index: { type: 'string', 'x-found-in': 'path' },
      },
      required: ['index'],
    }
  },
  {
    name: 'upgrade',
    namespace: 'agents',
    description: 'Upgrade an agent',
    method: 'POST',
    path: '/agents/{agentId}/upgrade',
    input: {
      type: 'object',
      properties: {
        agentId: { type: 'string', 'x-found-in': 'path' },
      },
      required: ['agentId'],
    }
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

  it('maps a snake_case param to a camelCase schema key (e.g. agent_id -> agentId)', () => {
    const result = mapAction('agents.upgrade', { agent_id: 'a1' }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'agents', 'upgrade', '--agent-id', 'a1'])
  })

  it('appends --yes for a DELETE action so non-interactive test runs do not prompt', () => {
    const result = mapAction('indices.delete', { index: 'test' }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'indices', 'delete', '--yes', '--index', 'test'])
  })

  it('appends --yes when intent.destructive is set even if the method is not DELETE', () => {
    const result = mapAction('indices.forcemerge', { index: 'test' }, actionMap)
    assert.ok(result)
    assert.deepStrictEqual(result.cliArgs, ['stack', 'es', 'indices', 'forcemerge', '--yes', '--index', 'test'])
  })

  it('does not append --yes for a non-destructive action', () => {
    const result = mapAction('indices.create', { index: 'test' }, actionMap)
    assert.ok(result)
    assert.ok(!result.cliArgs.includes('--yes'))
  })
})
