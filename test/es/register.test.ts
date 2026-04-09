/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { registerEsCommands } from '../../src/es/register.ts'

function makeDef(name: string, namespace: string, description = `${name} description`): EsApiDefinition {
  return { name, namespace, description, method: 'GET', path: `/_${namespace}/${name}` }
}

/** definition with no namespace - registers as a direct leaf under `es` */
function makeRootDef(name: string, description = `${name} description`): EsApiDefinition {
  return { name, description, method: 'GET', path: `/_${name}` }
}

const testDefs: EsApiDefinition[] = [
  makeDef('health', 'cat'),
  makeDef('indices', 'cat'),
  makeDef('create', 'indices'),
  makeDef('delete', 'indices'),
]

describe('registerEsCommands', () => {
  it('returns an OpaqueCommandHandle named "es"', () => {
    const handle = registerEsCommands(testDefs)
    assert.equal(handle.name(), 'es')
  })

  it('creates one child group per unique namespace', () => {
    const handle = registerEsCommands(testDefs)
    const groupNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(groupNames, ['cat', 'indices'])
  })

  it('each namespace group has leaf commands matching definition names', () => {
    const handle = registerEsCommands(testDefs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const catCommandNames = cat.commands.map((c) => c.name()).sort()
    assert.deepEqual(catCommandNames, ['health', 'indices'])

    const idx = handle.commands.find((c) => c.name() === 'indices')
    assert.ok(idx != null)
    const idxCommandNames = idx.commands.map((c) => c.name()).sort()
    assert.deepEqual(idxCommandNames, ['create', 'delete'])
  })

  it('leaf command descriptions match definitions', () => {
    const handle = registerEsCommands(testDefs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const health = cat.commands.find((c) => c.name() === 'health')
    assert.ok(health != null)
    assert.equal(health.description(), 'health description')
  })

  it('works with a single namespace', () => {
    const defs: EsApiDefinition[] = [makeDef('health', 'cat'), makeDef('nodes', 'cat')]
    const handle = registerEsCommands(defs)
    assert.equal(handle.commands.length, 1)
    assert.equal(handle.commands[0]?.name(), 'cat')
    assert.equal(handle.commands[0]?.commands.length, 2)
  })

  it('throws on duplicate command names within a namespace', () => {
    const defs: EsApiDefinition[] = [makeDef('health', 'cat'), makeDef('health', 'cat')]
    assert.throws(() => registerEsCommands(defs), /duplicate.*health|health.*duplicate/i)
  })

  it('allows the same command name in different namespaces', () => {
    const defs: EsApiDefinition[] = [makeDef('get', 'cat'), makeDef('get', 'indices')]
    assert.doesNotThrow(() => registerEsCommands(defs))
  })

  it('registers query params as --flags on leaf commands (via input schema)', () => {
    const defs: EsApiDefinition[] = [{
      name: 'health',
      namespace: 'cat',
      description: 'Health',
      method: 'GET',
      path: '/_cat/health',
      input: z.looseObject({
        v: z.boolean().optional().describe('Verbose').meta({ found_in: 'query' }),
        pretty: z.boolean().optional().describe('Pretty').meta({ found_in: 'query' }),
      }),
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--v'), `expected --v, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--pretty'), `expected --pretty, got: ${optionNames.join(', ')}`)
  })

  it('registers path params as --flags on leaf commands (via input schema)', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      input: z.looseObject({
        index: z.string().describe('Index name').meta({ found_in: 'path' }),
      }),
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index flag, got: ${optionNames.join(', ')}`)
  })

  it('registers a --input-file flag when the definition has an input schema', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      input: z.looseObject({
        index: z.string().describe('Index name').meta({ found_in: 'path' }),
        settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
      }),
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    // the factory registers --input-file whenever an input schema is provided
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--input-file'), `expected --input-file flag, got: ${optionNames.join(', ')}`)
  })
})

describe('registerEsCommands - namespace-less (root) definitions', () => {
  it('a definition without namespace registers as a direct leaf of `es`', () => {
    const defs: EsApiDefinition[] = [makeRootDef('search')]
    const handle = registerEsCommands(defs)
    const child = handle.commands.find((c) => c.name() === 'search')
    assert.ok(child != null, 'expected `search` as direct child of `es`')
    assert.equal(child.commands.length, 0, 'search should be a leaf, not a group')
  })

  it('namespace-less definitions do not create an intermediate group', () => {
    const defs: EsApiDefinition[] = [makeRootDef('bulk'), makeRootDef('search')]
    const handle = registerEsCommands(defs)
    const names = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(names, ['bulk', 'search'])
  })

  it('namespace-less and namespaced definitions coexist under `es`', () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('search'),
      makeDef('health', 'cat'),
      makeDef('indices', 'cat'),
    ]
    const handle = registerEsCommands(defs)
    // `cat` group and `search` leaf are both direct children of `es`
    const topNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(topNames, ['cat', 'search'])
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    assert.deepEqual(cat.commands.map((c) => c.name()).sort(), ['health', 'indices'])
  })

  it('description from the definition is used on the leaf command', () => {
    const defs: EsApiDefinition[] = [makeRootDef('search', 'Run a search')]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands.find((c) => c.name() === 'search')
    assert.ok(cmd != null)
    assert.equal(cmd.description(), 'Run a search')
  })

  it('throws on duplicate names among namespace-less definitions', () => {
    const defs: EsApiDefinition[] = [makeRootDef('search'), makeRootDef('search')]
    assert.throws(() => registerEsCommands(defs), /duplicate.*search|search.*duplicate/i)
  })

  it('throws when a namespace-less name collides with a namespace group name', () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('cat'),
      makeDef('health', 'cat'),
    ]
    assert.throws(() => registerEsCommands(defs), /duplicate.*cat|cat.*duplicate/i)
  })
})

describe('registerEsCommands - extensibility', () => {
  it('a definition added to an existing namespace appears in the command tree with no other changes', () => {
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('nodes', 'cat'),
      makeDef('count', 'cat'),
    ]
    const handle = registerEsCommands(defs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const names = cat.commands.map((c) => c.name()).sort()
    assert.deepEqual(names, ['count', 'health', 'nodes'])
  })

  it('a new namespace array spread into allApis causes a new group to appear', () => {
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('stats', 'cluster'),
      makeDef('settings', 'cluster'),
    ]
    const handle = registerEsCommands(defs)
    const groupNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(groupNames, ['cat', 'cluster'])
    const cluster = handle.commands.find((c) => c.name() === 'cluster')
    assert.ok(cluster != null)
    assert.equal(cluster.commands.length, 2)
  })

  it('rejects a malformed definition (bad name) at registration time', () => {
    const defs: EsApiDefinition[] = [{ ...makeDef('health', 'cat'), name: 'Bad_Name' }]
    assert.throws(() => registerEsCommands(defs), /invalid.*name/i)
  })

  it('rejects a malformed definition (path missing leading slash) at registration time', () => {
    const defs: EsApiDefinition[] = [{ ...makeDef('health', 'cat'), path: '_cat/health' }]
    assert.throws(() => registerEsCommands(defs), /path.*must start/i)
  })

  it('rejects a malformed definition (path token with no found_in: "path" field) at registration time', () => {
    const defs: EsApiDefinition[] = [{
      ...makeDef('get', 'indices'),
      path: '/{index}',
      input: z.looseObject({}),  // {index} token in path but no found_in: "path" field
    }]
    assert.throws(() => registerEsCommands(defs), /path.*param.*index/i)
  })
})

describe('registerEsCommands - body field flattening', () => {
  it('registers body fields as individual --flags, not a --body flag', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      input: z.looseObject({
        index: z.string().describe('Index name').meta({ found_in: 'path' }),
        settings: z.record(z.string(), z.unknown()).optional().describe('Index settings').meta({ found_in: 'body' }),
        mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings').meta({ found_in: 'body' }),
      }),
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--settings'), `expected --settings flag, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--mappings'), `expected --mappings flag, got: ${optionNames.join(', ')}`)
    assert.ok(!optionNames.includes('--body'), '--body flag must not appear; body fields are top-level')
  })
})

describe('registerEsCommands - unified input schema', () => {
  it('registers a command with a unified input schema: flags, help text, and validation all work', () => {
    const input = z.looseObject({
      index: z.string().describe('Target index').meta({ found_in: 'path' }),
      pretty: z.boolean().optional().describe('Pretty-print response').meta({ found_in: 'query' }),
      settings: z.record(z.string(), z.unknown()).optional().describe('Index settings').meta({ found_in: 'body' }),
    })
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create an index',
      method: 'PUT',
      path: '/{index}',
      input,
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--pretty'), `expected --pretty, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--settings'), `expected --settings, got: ${optionNames.join(', ')}`)
  })
})

describe('registerEsCommands - external schema consumption', () => {
  // simulates a schema imported from @elastic/zod/indices - defined outside the manifest
  const externalCreateSchema = z.looseObject({
    index: z.string().describe('Target index').meta({ found_in: 'path' }),
    wait_for_active_shards: z.string().optional().describe('Number of active shards to wait for').meta({ found_in: 'query' }),
    settings: z.record(z.string(), z.unknown()).optional().describe('Index settings').meta({ found_in: 'body' }),
    mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings').meta({ found_in: 'body' }),
  })

  it('registers a command using an externally defined input schema', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--wait-for-active-shards'), `expected --wait-for-active-shards, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--settings'), `expected --settings, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--mappings'), `expected --mappings, got: ${optionNames.join(', ')}`)
  })

  it('validates an externally sourced schema paired with a local manifest without throwing', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    assert.doesNotThrow(() => registerEsCommands(defs))
  })

  it('--input-file flag is registered (external schema enables file/stdin merging)', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--input-file'), `expected --input-file flag for stdin/file merging`)
  })
})

describe('registerEsCommands - built-in API surface', () => {
  it('all built-in API schemas are JSON-Schema-serializable', () => {
    assert.doesNotThrow(() => registerEsCommands())
  })

  it('throws at registration time when a schema contains z.date()', () => {
    const defs: EsApiDefinition[] = [{
      name: 'search',
      description: 'Search',
      method: 'GET',
      path: '/_search',
      input: z.looseObject({
        timestamp: z.date().optional().describe('A JS Date - not valid in a REST API schema').meta({ found_in: 'query' }),
      }),
    }]
    assert.throws(
      () => registerEsCommands(defs),
      /Date cannot be represented in JSON Schema/,
    )
  })
})
