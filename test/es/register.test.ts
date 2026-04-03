/**
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

  it('registers query params as --flags on leaf commands', () => {
    const defs: EsApiDefinition[] = [{
      name: 'health',
      namespace: 'cat',
      description: 'Health',
      method: 'GET',
      path: '/_cat/health',
      queryParams: [
        { name: 'v', type: 'boolean', description: 'Verbose' },
        { name: 'format', cliFlag: 'response-format', type: 'string', description: 'Format' },
      ],
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--v'), `expected --v, got: ${optionNames.join(', ')}`)
    // cliFlag override causes the flag to be registered as --response-format, not --format
    assert.ok(optionNames.includes('--response-format'), `expected --response-format, got: ${optionNames.join(', ')}`)
    assert.ok(!optionNames.includes('--format'), `--format should not appear; cliFlag override is --response-format`)
  })

  it('registers path params as --flags on leaf commands', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index flag, got: ${optionNames.join(', ')}`)
  })

  it('registers a --file flag (body input) when the definition has a body schema', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      body: z.object({ settings: z.record(z.string(), z.unknown()).optional() }),
    }]
    const handle = registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    // the factory registers --file whenever an input schema is provided
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--file'), `expected --file flag, got: ${optionNames.join(', ')}`)
  })
})

describe('registerEsCommands — extensibility', () => {
  it('a definition added to an existing namespace appears in the command tree with no other changes', () => {
    // simulate adding one entry to the cat namespace
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('nodes', 'cat'),
      makeDef('count', 'cat'), // newly added
    ]
    const handle = registerEsCommands(defs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const names = cat.commands.map((c) => c.name()).sort()
    assert.deepEqual(names, ['count', 'health', 'nodes'])
  })

  it('a new namespace array spread into allApis causes a new group to appear', () => {
    // simulate a new 'cluster' namespace being added to the barrel
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('stats', 'cluster'),  // new namespace
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

  it('rejects a malformed definition (pathParam token with no definition) at registration time', () => {
    const defs: EsApiDefinition[] = [{
      ...makeDef('get', 'indices'),
      path: '/{index}',
      pathParams: [], // token in path but no matching param defined
    }]
    assert.throws(() => registerEsCommands(defs), /path.*param.*index.*not.*defined|missing.*pathParam/i)
  })
})

describe('registerEsCommands — body field flattening', () => {
  it('registers body fields as individual --flags, not a --body flag', () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Create',
      method: 'PUT',
      path: '/{index}',
      pathParams: [{ name: 'index', description: 'Index name', required: true }],
      body: z.object({
        settings: z.record(z.string(), z.unknown()).optional().describe('Index settings'),
        mappings: z.record(z.string(), z.unknown()).optional().describe('Index mappings'),
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
