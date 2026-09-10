/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSidecarRefs, createSidecarResolver, resolveRootRef, requireSchemaModule, setSchemaLoaders } from '../../src/lib/json-schema-refs.ts'
import { loadEsApisInFile } from '../../src/es/apis.ts'

describe('resolveSidecarRefs', () => {
  it('returns the schema unchanged when it has no sidecar (external-file) refs', async () => {
    const schema = { type: 'object', properties: { id: { $ref: '#/$defs/Id' } }, $defs: { Id: { type: 'string' } } }
    let calls = 0
    const result = await resolveSidecarRefs(schema, async () => { calls++; return {} })
    assert.equal(result, schema, 'should return the exact same object reference when nothing to resolve')
    assert.equal(calls, 0, 'must not call loadSidecar when there are no external refs')
  })

  it('resolves a sidecar ref with a leading "./" (ES-style) into the schema\'s own $defs', async () => {
    const schema = {
      type: 'object',
      properties: { fields: { $ref: './_types.json#/$defs/_types__Fields', description: 'fields' } },
    }
    const result = await resolveSidecarRefs(schema, async (filename) => {
      assert.equal(filename, '_types.json')
      return { _types__Fields: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } }
    })
    assert.deepEqual(result['properties'], { fields: { $ref: '#/$defs/_types__Fields', description: 'fields' } })
    assert.deepEqual((result['$defs'] as Record<string, unknown>)['_types__Fields'], {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    })
  })

  it('resolves a sidecar ref with no leading prefix (cloud-style) the same way', async () => {
    const schema = {
      type: 'object',
      properties: { role_assignments: { $ref: '_defs.json#/$defs/RoleAssignments' } },
    }
    const result = await resolveSidecarRefs(schema, async (filename) => {
      assert.equal(filename, '_defs.json')
      return { RoleAssignments: { type: 'object' } }
    })
    assert.deepEqual(result['properties'], { role_assignments: { $ref: '#/$defs/RoleAssignments' } })
    assert.deepEqual((result['$defs'] as Record<string, unknown>)['RoleAssignments'], { type: 'object' })
  })

  it('rewrites sidecar refs nested inside oneOf/anyOf arrays', async () => {
    const schema = {
      type: 'object',
      properties: {
        metric: {
          oneOf: [
            { $ref: './watcher.stats.json#/$defs/watcher.stats__WatcherMetric' },
            { type: 'array', items: { $ref: './watcher.stats.json#/$defs/watcher.stats__WatcherMetric' } },
          ],
        },
      },
    }
    const result = await resolveSidecarRefs(schema, async () => ({
      'watcher.stats__WatcherMetric': { enum: ['all', 'queued_watches'] },
    }))
    const props = result['properties'] as Record<string, { oneOf: Array<Record<string, unknown>> }>
    assert.equal(props.metric.oneOf[0]!['$ref'], '#/$defs/watcher.stats__WatcherMetric')
    assert.equal((props.metric.oneOf[1]!['items'] as Record<string, unknown>)['$ref'], '#/$defs/watcher.stats__WatcherMetric')
  })

  it('merges defs from multiple distinct sidecar files', async () => {
    const schema = {
      type: 'object',
      properties: {
        a: { $ref: './one.json#/$defs/A' },
        b: { $ref: './two.json#/$defs/B' },
      },
    }
    const result = await resolveSidecarRefs(schema, async (filename) => {
      if (filename === 'one.json') return { A: { type: 'string' } }
      if (filename === 'two.json') return { B: { type: 'number' } }
      throw new Error(`unexpected sidecar: ${filename}`)
    })
    assert.deepEqual(result['$defs'], { A: { type: 'string' }, B: { type: 'number' } })
  })

  it('calls loadSidecar once per distinct file directly referenced by the schema', async () => {
    const schema = {
      type: 'object',
      properties: {
        a: { $ref: './shared.json#/$defs/A' },
        b: { $ref: './shared.json#/$defs/B' },
      },
    }
    let calls = 0
    await resolveSidecarRefs(schema, async () => {
      calls++
      return { A: { type: 'string' }, B: { type: 'number' } }
    })
    assert.equal(calls, 1)
  })

  it('prunes unreachable defs from a large sidecar file down to what the schema actually uses', async () => {
    const schema = { type: 'object', properties: { fields: { $ref: './big.json#/$defs/Used' } } }
    const result = await resolveSidecarRefs(schema, async () => ({
      Used: { type: 'string' },
      Unrelated1: { type: 'number' },
      Unrelated2: { type: 'object' },
    }))
    assert.deepEqual(result['$defs'], { Used: { type: 'string' } })
  })

  it('keeps defs transitively reachable through a used def\'s own nested ref, but prunes the rest', async () => {
    const schema = { type: 'object', properties: { fields: { $ref: './big.json#/$defs/Used' } } }
    const result = await resolveSidecarRefs(schema, async () => ({
      Used: { $ref: '#/$defs/Nested' },
      Nested: { type: 'string' },
      Unrelated: { type: 'number' },
    }))
    assert.deepEqual(result['$defs'], { Used: { $ref: '#/$defs/Nested' }, Nested: { type: 'string' } })
  })

  it('leaves same-document "#/$defs/..." refs untouched and never passes them to loadSidecar', async () => {
    const schema = {
      type: 'object',
      properties: { timeout: { $ref: '#/$defs/Duration' } },
      $defs: { Duration: { type: 'string' } },
    }
    const result = await resolveSidecarRefs(schema, async () => {
      throw new Error('loadSidecar must not be called for same-document refs')
    })
    assert.deepEqual(result['properties'], { timeout: { $ref: '#/$defs/Duration' } })
  })

  it('rewrites sidecar refs inside the schema\'s own $defs, not just its properties', async () => {
    const schema = {
      type: 'object',
      properties: { body: { $ref: '#/$defs/AccountUpdateRequest' } },
      $defs: {
        AccountUpdateRequest: {
          type: 'object',
          properties: { trust: { $ref: '_defs.json#/$defs/AccountTrustSettings' } },
        },
      },
    }
    const result = await resolveSidecarRefs(schema, async () => ({ AccountTrustSettings: { type: 'object' } }))
    assert.deepEqual(result['$defs'], {
      AccountUpdateRequest: { type: 'object', properties: { trust: { $ref: '#/$defs/AccountTrustSettings' } } },
      AccountTrustSettings: { type: 'object' },
    })
  })
})

describe('createSidecarResolver', () => {
  it('flattens a sidecar file\'s own $defs, keyed by def name', async () => {
    const resolver = createSidecarResolver(async () => ({ $defs: { A: { type: 'string' } } }))
    const defs = await resolver('one.json')
    assert.deepEqual(defs, { A: { type: 'string' } })
  })

  it('follows a transitive sidecar ref (one file\'s def referencing another file)', async () => {
    const loaded: string[] = []
    const resolver = createSidecarResolver(async (filename) => {
      loaded.push(filename)
      if (filename === 'one.json') return { $defs: { A: { $ref: './two.json#/$defs/B' } } }
      if (filename === 'two.json') return { $defs: { B: { type: 'string' } } }
      throw new Error(`unexpected sidecar: ${filename}`)
    })
    const defs = await resolver('one.json')
    assert.deepEqual(loaded.sort(), ['one.json', 'two.json'])
    assert.deepEqual(defs, { A: { $ref: '#/$defs/B' }, B: { type: 'string' } })
  })

  it('loads and expands each file only once no matter how many times it is requested', async () => {
    let calls = 0
    const resolver = createSidecarResolver(async () => {
      calls++
      return { $defs: { A: { type: 'string' } } }
    })
    await Promise.all([resolver('one.json'), resolver('one.json'), resolver('one.json')])
    await resolver('one.json')
    assert.equal(calls, 1)
  })

  it('resolves cyclic sidecar references to the complete def union, from either entry point', async () => {
    // `_types.json` and `_types.query_dsl.json` in @elastic/schemas reference each other;
    // cutting the cycle must not leave either file's result missing the other's defs.
    const loadRaw = async (filename: string): Promise<Record<string, unknown>> => {
      if (filename === 'a.json') return { $defs: { A: { $ref: './b.json#/$defs/B' } } }
      if (filename === 'b.json') return { $defs: { B: { $ref: './a.json#/$defs/A' } } }
      throw new Error(`unexpected sidecar: ${filename}`)
    }
    const complete = { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } }
    assert.deepEqual(await createSidecarResolver(loadRaw)('a.json'), complete)
    assert.deepEqual(await createSidecarResolver(loadRaw)('b.json'), complete)

    // Both entry points through one resolver: the cached result of the file reached
    // *inside* the cycle must be complete too, not truncated where the cycle was cut.
    const shared = createSidecarResolver(loadRaw)
    assert.deepEqual(await shared('a.json'), complete)
    assert.deepEqual(await shared('b.json'), complete)
  })
})


describe('createDefinitionResolver', () => {
  // Regression: `_types.json` and its siblings form reference cycles, so a resolver that
  // truncated a file's defs where it cut the cycle left these schemas with `$ref`s
  // pointing at definitions absent from their own `$defs`.
  for (const namespaceFile of ['ml.evaluate_data_frame', 'indices.analyze', 'search']) {
    it(`resolves every ref in the real ${namespaceFile} schema into its own $defs`, async () => {
      const defs = await loadEsApisInFile(namespaceFile)
      assert.ok(defs.length > 0)
      for (const def of defs) {
        assert.ok(def.input != null, `${def.name} should have an input schema`)
        const available = new Set(Object.keys((def.input['$defs'] ?? {}) as Record<string, unknown>))
        for (const name of collectRefNames(def.input)) {
          assert.ok(available.has(name), `${def.name}: $ref "#/$defs/${name}" has no matching def`)
        }
      }
    })
  }
})

/** Collects every same-document `#/$defs/Name` ref name in a resolved schema. */
function collectRefNames (node: unknown, out: Set<string> = new Set()): Set<string> {
  if (node == null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) collectRefNames(item, out)
    return out
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      assert.ok(value.startsWith('#/$defs/'), `unresolved external ref: ${value}`)
      out.add(value.slice('#/$defs/'.length))
    } else {
      collectRefNames(value, out)
    }
  }
  return out
}
describe('resolveRootRef', () => {
  it('returns schema unchanged when it already has top-level properties', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } }
    assert.equal(resolveRootRef(schema), schema)
  })

  it('returns schema unchanged when there is no $ref', () => {
    const schema = { type: 'object' }
    assert.equal(resolveRootRef(schema), schema)
  })

  it('resolves a root $ref into the $defs target, preserving $defs for nested refs', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'delete-api-keys',
      $ref: '#/$defs/DeleteApiKeysRequest',
      $defs: {
        DeleteApiKeysRequest: {
          type: 'object',
          properties: { keys: { type: 'array', items: { type: 'string' } } },
          required: ['keys'],
        },
      },
    }
    const result = resolveRootRef(schema)
    assert.deepEqual(result['properties'], { keys: { type: 'array', items: { type: 'string' } } })
    assert.deepEqual(result['required'], ['keys'])
    assert.ok(result['$defs'] != null, 'should preserve $defs for nested ref resolution')
  })

  it('throws on a root $ref to a sidecar (external-file) target', () => {
    const schema = { $ref: './_defs.json#/$defs/Foo' }
    assert.throws(() => resolveRootRef(schema), /unsupported root \$ref/)
  })

  it('throws when the root $ref target has no properties', () => {
    const schema = { $ref: '#/$defs/Empty', $defs: { Empty: { type: 'string' } } }
    assert.throws(() => resolveRootRef(schema), /does not resolve to an object schema with properties/)
  })

  it('throws when the root $ref target is missing entirely', () => {
    const schema = { $ref: '#/$defs/Missing', $defs: {} }
    assert.throws(() => resolveRootRef(schema), /does not resolve to an object schema with properties/)
  })
})

describe('requireSchemaModule', () => {
  it('falls back to createRequire when no loader is registered', async () => {
    setSchemaLoaders({})
    const mod = await requireSchemaModule<{ $defs?: Record<string, unknown> }>('@elastic/schemas/es/json/_types.json')
    assert.ok(mod.$defs != null && Object.keys(mod.$defs).length > 0)
  })

  it('uses a registered json loader and unwraps default', async () => {
    const payload = { $defs: { Fake: { type: 'string' } } }
    setSchemaLoaders({
      '@elastic/schemas/es/json/_types.json': async () => ({ default: payload }),
    })
    try {
      const mod = await requireSchemaModule('@elastic/schemas/es/json/_types.json')
      assert.equal(mod, payload)
    } finally {
      setSchemaLoaders({})
    }
  })

  it('uses a registered js loader without unwrapping', async () => {
    const ns = { search_definitions: [{ name: 'search' }] }
    const spec = '@elastic/schemas/es/tools/apis/search.js'
    setSchemaLoaders({
      [spec]: async () => ns,
    })
    try {
      const mod = await requireSchemaModule<typeof ns>(spec)
      assert.equal(mod, ns)
    } finally {
      setSchemaLoaders({})
    }
  })

  it('throws on missing modules and path traversal', async () => {
    setSchemaLoaders({})
    await assert.rejects(() => requireSchemaModule(''), /refusing to load schema module/)
    await assert.rejects(() => requireSchemaModule('../package.json'), /refusing to load schema module/)
    await assert.rejects(() => requireSchemaModule('../../package.json'), /refusing to load schema module/)
    await assert.rejects(() => requireSchemaModule('@elastic/schemas/does-not-exist.json'))
  })
})
