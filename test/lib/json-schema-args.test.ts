/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SchemaArgDefinition } from '../../src/lib/json-schema-args.ts'
import { toKebabCase, extractSchemaArgs, buildFlagKeyMap, validateSchemaArgs } from '../../src/lib/json-schema-args.ts'

// Helper: build a minimal JSON Schema for testing
function schema (
  properties: Record<string, Record<string, unknown>>,
  required: string[] = []
): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

describe('toKebabCase', () => {
  it('converts snake_case to kebab-case', () => {
    assert.equal(toKebabCase('num_shards'), 'num-shards')
    assert.equal(toKebabCase('api_key'), 'api-key')
    assert.equal(toKebabCase('refresh_interval'), 'refresh-interval')
  })

  it('converts camelCase to kebab-case', () => {
    assert.equal(toKebabCase('refreshInterval'), 'refresh-interval')
    assert.equal(toKebabCase('numShards'), 'num-shards')
    assert.equal(toKebabCase('apiKey'), 'api-key')
    assert.equal(toKebabCase('mappingConfig'), 'mapping-config')
  })

  it('passes through lowercase as-is', () => {
    assert.equal(toKebabCase('index'), 'index')
    assert.equal(toKebabCase('format'), 'format')
    assert.equal(toKebabCase('verbose'), 'verbose')
  })

  it('handles mixed snake_case and camelCase', () => {
    assert.equal(toKebabCase('index_name_config'), 'index-name-config')
    assert.equal(toKebabCase('indexNameConfig'), 'index-name-config')
  })

  it('strips leading underscores (Elasticsearch _source-style keys)', () => {
    assert.equal(toKebabCase('_source'), 'source')
    assert.equal(toKebabCase('_source_includes'), 'source-includes')
    assert.equal(toKebabCase('_meta'), 'meta')
    assert.equal(toKebabCase('_field_names'), 'field-names')
  })
})

describe('extractSchemaArgs', () => {
  it('extracts top-level keys from JSON Schema properties', () => {
    const s = schema({ index: { type: 'string' }, size: { type: 'integer' } })
    const args = extractSchemaArgs(s)
    assert.equal(args.length, 2)
    const keys = args.map((a) => a.schemaKey).sort()
    assert.deepEqual(keys, ['index', 'size'])
  })

  it('derives kebab-case cliFlag from schemaKey', () => {
    const s = schema({ num_shards: { type: 'integer' }, refreshInterval: { type: 'integer' } })
    const args = extractSchemaArgs(s)
    const flagMap = new Map(args.map((a) => [a.schemaKey, a.cliFlag]))
    assert.equal(flagMap.get('num_shards'), 'num-shards')
    assert.equal(flagMap.get('refreshInterval'), 'refresh-interval')
  })

  it('identifies type for all supported JSON Schema types', () => {
    const s = schema({
      name: { type: 'string' },
      count: { type: 'integer' },
      ratio: { type: 'number' },
      active: { type: 'boolean' },
      mappings: { type: 'object' },
      tags: { type: 'array' },
      level: { type: 'string', enum: ['low', 'medium', 'high'] },
    })
    const typeMap = new Map(extractSchemaArgs(s).map((a) => [a.schemaKey, a.type]))
    assert.equal(typeMap.get('name'), 'string')
    assert.equal(typeMap.get('count'), 'number')
    assert.equal(typeMap.get('ratio'), 'number')
    assert.equal(typeMap.get('active'), 'boolean')
    assert.equal(typeMap.get('mappings'), 'object')
    assert.equal(typeMap.get('tags'), 'array')
    assert.equal(typeMap.get('level'), 'enum')
  })

  it('determines required status from "required" array', () => {
    const s = schema(
      { required_field: { type: 'string' }, optional_field: { type: 'string' }, with_default: { type: 'string', default: 'hello' } },
      ['required_field']
    )
    const reqMap = new Map(extractSchemaArgs(s).map((a) => [a.schemaKey, a.required]))
    assert.equal(reqMap.get('required_field'), true)
    assert.equal(reqMap.get('optional_field'), false)
    assert.equal(reqMap.get('with_default'), false) // has default → not required
  })

  it('extracts default values from properties', () => {
    const s = schema({
      no_default: { type: 'string' },
      str_default: { type: 'string', default: 'hello' },
      num_default: { type: 'integer', default: 10 },
      bool_default: { type: 'boolean', default: true },
    })
    const defaultMap = new Map(extractSchemaArgs(s).map((a) => [a.schemaKey, a.defaultValue]))
    assert.equal(defaultMap.get('no_default'), undefined)
    assert.equal(defaultMap.get('str_default'), 'hello')
    assert.equal(defaultMap.get('num_default'), 10)
    assert.equal(defaultMap.get('bool_default'), true)
  })

  it('extracts description from property description', () => {
    const s = schema({
      index: { type: 'string', description: 'Index name to search' },
      size: { type: 'integer', description: 'Number of results' },
      no_description: { type: 'string' },
    })
    const descMap = new Map(extractSchemaArgs(s).map((a) => [a.schemaKey, a.description]))
    assert.equal(descMap.get('index'), 'Index name to search')
    assert.equal(descMap.get('size'), 'Number of results')
    assert.equal(descMap.get('no_description'), '')
  })

  it('returns empty array for non-object schemas', () => {
    assert.deepEqual(extractSchemaArgs(null), [])
    assert.deepEqual(extractSchemaArgs(undefined), [])
    assert.deepEqual(extractSchemaArgs('string'), [])
    assert.deepEqual(extractSchemaArgs({ type: 'string' }), [])
  })

  it('returns empty array for schema with no properties', () => {
    assert.deepEqual(extractSchemaArgs({ type: 'object' }), [])
    assert.deepEqual(extractSchemaArgs({ type: 'object', properties: {} }), [])
  })

  it('reads x-found-in routing from property', () => {
    const s = schema({
      index: { type: 'string', 'x-found-in': 'path' },
      format: { type: 'string', 'x-found-in': 'query' },
      mappings: { type: 'object', 'x-found-in': 'body' },
    })
    const byKey = new Map(extractSchemaArgs(s).map((a) => [a.schemaKey, a]))
    assert.equal(byKey.get('index')?.foundIn, 'path')
    assert.equal(byKey.get('format')?.foundIn, 'query')
    assert.equal(byKey.get('mappings')?.foundIn, 'body')
  })

  it('foundIn is undefined when x-found-in is absent', () => {
    const s = schema({ index: { type: 'string' } })
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.foundIn, undefined)
  })

  it('detects acceptsArrayForm from anyOf with array branch', () => {
    const s = schema({
      fields: {
        anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
      },
    })
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'string')
    assert.equal(args[0]?.acceptsArrayForm, true)
  })

  it('does not flag a plain string property', () => {
    const s = schema({ name: { type: 'string' } })
    const args = extractSchemaArgs(s)
    assert.notEqual(args[0]?.acceptsArrayForm, true)
  })

  it('does not flag a plain array property', () => {
    const s = schema({ tags: { type: 'array', items: { type: 'string' } } })
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'array')
    assert.notEqual(args[0]?.acceptsArrayForm, true)
  })

  it('resolves $ref-only type to "string" as safe default', () => {
    const s: Record<string, unknown> = {
      type: 'object',
      properties: {
        master_timeout: { $ref: '#/$defs/Duration', description: 'timeout', 'x-found-in': 'query' },
      },
      $defs: {
        Duration: { type: 'string' },
      },
    }
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'string')
    assert.equal(args[0]?.foundIn, 'query')
  })
})

describe('resolveType via $defs dereferencing', () => {
  it('resolves $ref-only body field to object type when $defs defines it as object', () => {
    const s: Record<string, unknown> = {
      type: 'object',
      properties: {
        mappings: { $ref: '#/$defs/MappingTypeMapping', description: 'Index mappings', 'x-found-in': 'body' },
      },
      $defs: {
        MappingTypeMapping: { type: 'object', properties: { dynamic: { type: 'string' } } },
      },
    }
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'object')
  })

  it('resolves $ref-only query field to number type when $defs defines it as number', () => {
    const s: Record<string, unknown> = {
      type: 'object',
      properties: {
        from: { $ref: '#/$defs/integer', description: 'skip N docs', 'x-found-in': 'query' },
      },
      $defs: {
        integer: { type: 'number' },
      },
    }
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'number')
  })

  it('resolves anyOf with only $ref variants by dereferencing each', () => {
    const s: Record<string, unknown> = {
      type: 'object',
      properties: {
        doc: { anyOf: [{ $ref: '#/$defs/DocA' }, { $ref: '#/$defs/DocB' }], 'x-found-in': 'body' },
      },
      $defs: {
        DocA: { type: 'object' },
        DocB: { type: 'object' },
      },
    }
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'object')
  })

  it('keeps string type for duration-like anyOf that includes a string branch alongside number consts', () => {
    // keep_alive: anyOf [string, {number,const:-1}, {number,const:0}] → should be 'string'
    const s: Record<string, unknown> = {
      type: 'object',
      properties: {
        keep_alive: {
          anyOf: [
            { type: 'string' },
            { type: 'number', const: -1 },
            { type: 'number', const: 0 },
          ],
          'x-found-in': 'query',
        },
      },
    }
    const args = extractSchemaArgs(s)
    assert.equal(args[0]?.type, 'string')
  })
})

describe('buildFlagKeyMap', () => {
  it('creates bidirectional mapping between cliFlag and schemaKey', () => {
    const args: SchemaArgDefinition[] = [
      { schemaKey: 'num_shards', cliFlag: 'num-shards', type: 'number', required: true, description: '' },
      { schemaKey: 'refreshInterval', cliFlag: 'refresh-interval', type: 'number', required: false, description: '' },
    ]
    const map = buildFlagKeyMap(args)
    assert.equal(map.toSchemaKey.get('num-shards'), 'num_shards')
    assert.equal(map.toSchemaKey.get('refresh-interval'), 'refreshInterval')
    assert.equal(map.toCliFlag.get('num_shards'), 'num-shards')
    assert.equal(map.toCliFlag.get('refreshInterval'), 'refresh-interval')
  })

  it('round-trips snake_case keys correctly', () => {
    const args: SchemaArgDefinition[] = [
      { schemaKey: 'api_key', cliFlag: 'api-key', type: 'string', required: true, description: '' },
    ]
    const map = buildFlagKeyMap(args)
    const schemaKey = map.toSchemaKey.get(map.toCliFlag.get('api_key')!)
    assert.equal(schemaKey, 'api_key')
  })
})

describe('validateSchemaArgs', () => {
  it('throws when a schema key collides with a reserved flag', () => {
    for (const reserved of ['help', 'json', 'config-file', 'use-context', 'input-file']) {
      const args: SchemaArgDefinition[] = [
        { schemaKey: reserved, cliFlag: reserved, type: 'string', required: false, description: '' },
      ]
      assert.throws(() => validateSchemaArgs(args), /reserved/, `expected throw for reserved flag "${reserved}"`)
    }
  })

  it('throws when two schema keys produce the same kebab-case flag', () => {
    const args: SchemaArgDefinition[] = [
      { schemaKey: 'num_shards', cliFlag: 'num-shards', type: 'number', required: false, description: '' },
      { schemaKey: 'numShards', cliFlag: 'num-shards', type: 'number', required: false, description: '' },
    ]
    assert.throws(() => validateSchemaArgs(args), /collision/)
  })

  it('does not throw for valid, non-colliding schema args', () => {
    const args: SchemaArgDefinition[] = [
      { schemaKey: 'index', cliFlag: 'index', type: 'string', required: true, description: '' },
      { schemaKey: 'size', cliFlag: 'size', type: 'number', required: false, defaultValue: 10, description: '' },
    ]
    assert.doesNotThrow(() => validateSchemaArgs(args))
  })
})
