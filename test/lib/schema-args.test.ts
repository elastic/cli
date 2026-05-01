/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { SchemaArgDefinition } from '../../src/lib/schema-args.ts'
import { toKebabCase, extractSchemaArgs, buildFlagKeyMap, validateSchemaArgs, extractFoundIn } from '../../src/lib/schema-args.ts'

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
  it('extracts top-level keys from z.object()', () => {
    const schema = z.object({ index: z.string(), size: z.number() })
    const args = extractSchemaArgs(schema)
    assert.equal(args.length, 2)
    const keys = args.map((a) => a.schemaKey).sort()
    assert.deepEqual(keys, ['index', 'size'])
  })

  it('derives kebab-case cliFlag from schemaKey', () => {
    const schema = z.object({ num_shards: z.number(), refreshInterval: z.number() })
    const args = extractSchemaArgs(schema)
    const flagMap = new Map(args.map((a) => [a.schemaKey, a.cliFlag]))
    assert.equal(flagMap.get('num_shards'), 'num-shards')
    assert.equal(flagMap.get('refreshInterval'), 'refresh-interval')
  })

  it('identifies type for all supported schema types', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
      active: z.boolean(),
      mappings: z.object({ dynamic: z.boolean() }),
      tags: z.array(z.string()),
      level: z.enum(['low', 'medium', 'high']),
    })
    const typeMap = new Map(extractSchemaArgs(schema).map((a) => [a.schemaKey, a.type]))
    assert.equal(typeMap.get('name'), 'string')
    assert.equal(typeMap.get('count'), 'number')
    assert.equal(typeMap.get('active'), 'boolean')
    assert.equal(typeMap.get('mappings'), 'object')
    assert.equal(typeMap.get('tags'), 'array')
    assert.equal(typeMap.get('level'), 'enum')
  })

  it('preserves type for optional fields', () => {
    const schema = z.object({
      opt_str: z.string().optional(),
      opt_num: z.number().optional(),
      opt_bool: z.boolean().optional(),
    })
    const typeMap = new Map(extractSchemaArgs(schema).map((a) => [a.schemaKey, a.type]))
    assert.equal(typeMap.get('opt_str'), 'string')
    assert.equal(typeMap.get('opt_num'), 'number')
    assert.equal(typeMap.get('opt_bool'), 'boolean')
  })

  it('determines required status correctly', () => {
    const schema = z.object({
      required_field: z.string(),
      optional_field: z.string().optional(),
      with_default: z.string().default('default_value'),
    })
    const requiredMap = new Map(extractSchemaArgs(schema).map((a) => [a.schemaKey, a.required]))
    assert.equal(requiredMap.get('required_field'), true)
    assert.equal(requiredMap.get('optional_field'), false)
    assert.equal(requiredMap.get('with_default'), false)
  })

  it('extracts default values from schema', () => {
    const schema = z.object({
      no_default: z.string(),
      str_default: z.string().default('hello'),
      num_default: z.number().default(10),
      bool_default: z.boolean().default(true),
    })
    const defaultMap = new Map(extractSchemaArgs(schema).map((a) => [a.schemaKey, a.defaultValue]))
    assert.equal(defaultMap.get('no_default'), undefined)
    assert.equal(defaultMap.get('str_default'), 'hello')
    assert.equal(defaultMap.get('num_default'), 10)
    assert.equal(defaultMap.get('bool_default'), true)
  })

  it('extracts description from schema metadata', () => {
    const schema = z.object({
      index: z.string().describe('Index name to search'),
      size: z.number().describe('Number of results'),
      no_description: z.string(),
    })
    const descMap = new Map(extractSchemaArgs(schema).map((a) => [a.schemaKey, a.description]))
    assert.equal(descMap.get('index'), 'Index name to search')
    assert.equal(descMap.get('size'), 'Number of results')
    assert.equal(descMap.get('no_description'), '')
  })

  it('returns empty array for non-object schemas', () => {
    assert.deepEqual(extractSchemaArgs(z.string()), [])
    assert.deepEqual(extractSchemaArgs(null), [])
    assert.deepEqual(extractSchemaArgs(undefined), [])
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

  it('round-trips camelCase keys correctly', () => {
    const args: SchemaArgDefinition[] = [
      { schemaKey: 'indexName', cliFlag: 'index-name', type: 'string', required: false, description: '' },
    ]
    const map = buildFlagKeyMap(args)
    const schemaKey = map.toSchemaKey.get(map.toCliFlag.get('indexName')!)
    assert.equal(schemaKey, 'indexName')
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

describe('extractFoundIn', () => {
  it('returns "path" when .meta({found_in: "path"}) is outermost', () => {
    const field = z.string().meta({ found_in: 'path' })
    assert.equal(extractFoundIn(field), 'path')
  })

  it('returns "query" when .meta() is inside .optional() wrapper (defensive traversal)', () => {
    const field = z.string().meta({ found_in: 'query' }).optional()
    assert.equal(extractFoundIn(field), 'query')
  })

  it('returns undefined when no .meta() is present', () => {
    const field = z.string()
    assert.equal(extractFoundIn(field), undefined)
  })
})

describe('extractSchemaArgs foundIn population', () => {
  it('populates foundIn field on each SchemaArgDefinition', () => {
    const schema = z.object({
      index: z.string().meta({ found_in: 'path' }),
      format: z.string().meta({ found_in: 'query' }).optional(),
      mappings: z.object({}).meta({ found_in: 'body' }),
    })
    const args = extractSchemaArgs(schema)
    const byKey = new Map(args.map((a) => [a.schemaKey, a]))
    assert.equal(byKey.get('index')?.foundIn, 'path')
    assert.equal(byKey.get('format')?.foundIn, 'query')
    assert.equal(byKey.get('mappings')?.foundIn, 'body')
  })

  it('defaults foundIn to undefined when .meta() is absent', () => {
    const schema = z.object({ index: z.string() })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.foundIn, undefined)
  })
})

describe('unwrapField handles complex Zod types (#92)', () => {
  it('resolves z.lazy() to the underlying type', () => {
    const schema = z.object({
      size: z.lazy(() => z.number()).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'number')
  })

  it('classifies z.record() as object', () => {
    const schema = z.object({
      properties: z.record(z.string(), z.unknown()).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'object')
  })

  it('classifies z.any() as object', () => {
    const schema = z.object({
      document: z.any().optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'object')
  })

  it('resolves z.union() to the first member type', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'string')
  })

  it('resolves nested z.lazy(() => z.record())', () => {
    const schema = z.object({
      query: z.lazy(() => z.record(z.string(), z.unknown())).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'object')
  })
})

describe('extractSchemaArgs acceptsArrayForm detection (#167)', () => {
  it('flags union(string, array(string)) as acceptsArrayForm', () => {
    const schema = z.object({
      fields: z.union([z.string(), z.array(z.string())]).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'string')
    assert.equal(args[0]?.acceptsArrayForm, true)
  })

  it('flags union wrapped through z.lazy() as acceptsArrayForm', () => {
    const Field = z.string()
    const Fields = z.union([z.lazy(() => Field), z.array(z.lazy(() => Field))])
    const schema = z.object({
      fields: z.lazy(() => Fields).optional().meta({ found_in: 'body' }),
    })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'string')
    assert.equal(args[0]?.acceptsArrayForm, true)
    assert.equal(args[0]?.foundIn, 'body')
  })

  it('does not flag a plain string schema', () => {
    const schema = z.object({ name: z.string() })
    const args = extractSchemaArgs(schema)
    assert.notEqual(args[0]?.acceptsArrayForm, true)
  })

  it('does not flag a plain array schema (already registered as JSON)', () => {
    const schema = z.object({ tags: z.array(z.string()).optional() })
    const args = extractSchemaArgs(schema)
    assert.equal(args[0]?.type, 'array')
    assert.notEqual(args[0]?.acceptsArrayForm, true)
  })

  it('does not flag a union without an array branch', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]).optional(),
    })
    const args = extractSchemaArgs(schema)
    assert.notEqual(args[0]?.acceptsArrayForm, true)
  })
})
