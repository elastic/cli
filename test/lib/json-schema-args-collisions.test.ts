/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractSchemaArgs, buildFlagKeyMap } from '../../src/lib/json-schema-args.ts'

function schema (
  properties: Record<string, Record<string, unknown>>,
  required: string[] = []
): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

function flagsByKey (properties: Record<string, Record<string, unknown>>): Record<string, string> {
  const args = extractSchemaArgs(schema(properties))
  return Object.fromEntries(args.map((a) => [a.schemaKey, a.cliFlag]))
}

const kibanaJson = (...parts: string[]): string =>
  join(dirname(fileURLToPath(import.meta.url)), '../../node_modules/@elastic/schemas/src/kibana/json', ...parts)

const COLLIDING_SCHEMAS = [
  'security-exceptions-api.update-exception-list.request.json',
  'security-lists-api.patch-list.request.json',
  'security-lists-api.update-list.request.json',
]

describe('extractSchemaArgs collision handling', () => {
  it('throws loudly on an unrecognized duplicate-flag collision', () => {
    const s = schema({
      num_shards: { type: 'number' },
      numShards: { type: 'number' },
    })
    assert.throws(() => extractSchemaArgs(s), /collides with.*--num-shards/)
  })

  it('throws loudly on an unrecognized reserved-flag collision', () => {
    const s = schema({
      json: { type: 'string' },
    })
    assert.throws(() => extractSchemaArgs(s), /reserved flag "--json"/)
  })

  it('drops reserved help rather than throwing', () => {
    assert.deepEqual(flagsByKey({
      name: { type: 'string' },
      help: { type: 'boolean' },
    }), { name: 'name' })
  })

  it('gives `_version` and `version` distinct flags, first seen keeps version', () => {
    assert.deepEqual(flagsByKey({
      _version: { type: 'string' },
      version: { type: 'number' },
    }), { _version: 'version', version: 'x-version' })
  })

  it('gives `version` then `_version` distinct flags, first seen keeps version', () => {
    assert.deepEqual(flagsByKey({
      version: { type: 'number' },
      _version: { type: 'string' },
    }), { version: 'version', _version: 'x-version' })
  })

  it('keeps `--version` for a lone `_version` field', () => {
    assert.deepEqual(flagsByKey({ _version: { type: 'string' } }), { _version: 'version' })
  })

  it('keeps `--source` for a lone `_source` field', () => {
    assert.deepEqual(flagsByKey({ _source: { type: 'object' } }), { _source: 'source' })
  })

  it('disambiguates `_source` vs `source` the same way', () => {
    assert.deepEqual(flagsByKey({
      _source: { type: 'object' },
      source: { type: 'string' },
    }), { _source: 'source', source: 'x-source' })
  })

  it('throws when the x- prefix is already taken', () => {
    const s = schema({
      _version: { type: 'string' },
      version: { type: 'number' },
      'x-version': { type: 'string' },
    })
    assert.throws(() => extractSchemaArgs(s), /collides with.*--x-version/)
  })

  it('maps both flags back to the original schema keys', () => {
    const args = extractSchemaArgs(schema({
      _version: { type: 'string' },
      version: { type: 'number' },
    }))
    const map = buildFlagKeyMap(args)
    assert.equal(map.toSchemaKey.get('version'), '_version')
    assert.equal(map.toSchemaKey.get('x-version'), 'version')
    assert.equal(map.toCliFlag.get('_version'), 'version')
    assert.equal(map.toCliFlag.get('version'), 'x-version')
  })

  it('does not treat punctuation keys as the version collision', () => {
    assert.deepEqual(flagsByKey({
      '../': { type: 'string' },
      '?#': { type: 'string' },
      '': { type: 'string' },
    }), { '../': '../', '?#': '?#', '': '' })
  })

  for (const file of COLLIDING_SCHEMAS) {
    it(`exposes both version fields on ${file}`, () => {
      const s = JSON.parse(readFileSync(kibanaJson(file), 'utf8')) as unknown
      const args = extractSchemaArgs(s)
      const byKey = Object.fromEntries(args.map((a) => [a.schemaKey, a.cliFlag]))
      assert.equal(byKey._version, 'version')
      assert.equal(byKey.version, 'x-version')
    })
  }
})
