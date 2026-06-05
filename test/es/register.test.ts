/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { registerEsCommands, registerEsCommandsLazy } from '../../src/es/register.ts'

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
  it('returns an OpaqueCommandHandle named "es"', async () => {
    const handle = await registerEsCommands(testDefs)
    assert.equal(handle.name(), 'es')
  })

  it('creates one child group per unique namespace', async () => {
    const handle = await registerEsCommands(testDefs)
    const groupNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(groupNames, ['cat', 'helpers', 'indices'])
  })

  it('each namespace group has leaf commands matching definition names', async () => {
    const handle = await registerEsCommands(testDefs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const catCommandNames = cat.commands.map((c) => c.name()).sort()
    assert.deepEqual(catCommandNames, ['health', 'indices'])

    const idx = handle.commands.find((c) => c.name() === 'indices')
    assert.ok(idx != null)
    const idxCommandNames = idx.commands.map((c) => c.name()).sort()
    assert.deepEqual(idxCommandNames, ['create', 'delete'])
  })

  it('leaf command descriptions match definitions', async () => {
    const handle = await registerEsCommands(testDefs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const health = cat.commands.find((c) => c.name() === 'health')
    assert.ok(health != null)
    assert.equal(health.description(), 'health description')
  })

  it('works with a single namespace', async () => {
    const defs: EsApiDefinition[] = [makeDef('health', 'cat'), makeDef('nodes', 'cat')]
    const handle = await registerEsCommands(defs)
    // 1 namespace group + 1 helpers group
    assert.equal(handle.commands.length, 2)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    assert.equal(cat.commands.length, 2)
  })

  it('throws on duplicate command names within a namespace', async () => {
    const defs: EsApiDefinition[] = [makeDef('health', 'cat'), makeDef('health', 'cat')]
    await assert.rejects(registerEsCommands(defs), /duplicate.*health|health.*duplicate/i)
  })

  it('allows the same command name in different namespaces', async () => {
    const defs: EsApiDefinition[] = [makeDef('get', 'cat'), makeDef('get', 'indices')]
    await assert.doesNotReject(registerEsCommands(defs))
  })

  it('registers query params as --flags on leaf commands (via input schema)', async () => {
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
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--v'), `expected --v, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--pretty'), `expected --pretty, got: ${optionNames.join(', ')}`)
  })

  it('registers path params as --flags on leaf commands (via input schema)', async () => {
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
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index flag, got: ${optionNames.join(', ')}`)
  })

  it('registers a --input-file flag when the definition has an input schema', async () => {
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
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    // the factory registers --input-file whenever an input schema is provided
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--input-file'), `expected --input-file flag, got: ${optionNames.join(', ')}`)
  })
})

describe('registerEsCommands - namespace-less (root) definitions', () => {
  it('a definition without namespace registers as a direct leaf of `es`', async () => {
    const defs: EsApiDefinition[] = [makeRootDef('search')]
    const handle = await registerEsCommands(defs)
    const child = handle.commands.find((c) => c.name() === 'search')
    assert.ok(child != null, 'expected `search` as direct child of `es`')
    assert.equal(child.commands.length, 0, 'search should be a leaf, not a group')
  })

  it('namespace-less definitions do not create an intermediate group', async () => {
    const defs: EsApiDefinition[] = [makeRootDef('bulk'), makeRootDef('search')]
    const handle = await registerEsCommands(defs)
    const names = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(names, ['bulk', 'helpers', 'search'])
  })

  it('namespace-less and namespaced definitions coexist under `es`', async () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('search'),
      makeDef('health', 'cat'),
      makeDef('indices', 'cat'),
    ]
    const handle = await registerEsCommands(defs)
    // `cat` group and `search` leaf are both direct children of `es`
    const topNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(topNames, ['cat', 'helpers', 'search'])
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    assert.deepEqual(cat.commands.map((c) => c.name()).sort(), ['health', 'indices'])
  })

  it('description from the definition is used on the leaf command', async () => {
    const defs: EsApiDefinition[] = [makeRootDef('search', 'Run a search')]
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands.find((c) => c.name() === 'search')
    assert.ok(cmd != null)
    assert.equal(cmd.description(), 'Run a search')
  })

  it('throws on duplicate names among namespace-less definitions', async () => {
    const defs: EsApiDefinition[] = [makeRootDef('search'), makeRootDef('search')]
    await assert.rejects(registerEsCommands(defs), /duplicate.*search|search.*duplicate/i)
  })

  it('throws when a namespace-less name collides with a namespace group name', async () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('cat'),
      makeDef('health', 'cat'),
    ]
    await assert.rejects(registerEsCommands(defs), /duplicate.*cat|cat.*duplicate/i)
  })
})

describe('registerEsCommands - extensibility', () => {
  it('a definition added to an existing namespace appears in the command tree with no other changes', async () => {
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('nodes', 'cat'),
      makeDef('count', 'cat'),
    ]
    const handle = await registerEsCommands(defs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    const names = cat.commands.map((c) => c.name()).sort()
    assert.deepEqual(names, ['count', 'health', 'nodes'])
  })

  it('a new namespace array spread into allApis causes a new group to appear', async () => {
    const defs: EsApiDefinition[] = [
      makeDef('health', 'cat'),
      makeDef('stats', 'cluster'),
      makeDef('settings', 'cluster'),
    ]
    const handle = await registerEsCommands(defs)
    const groupNames = handle.commands.map((c) => c.name()).sort()
    assert.deepEqual(groupNames, ['cat', 'cluster', 'helpers'])
    const cluster = handle.commands.find((c) => c.name() === 'cluster')
    assert.ok(cluster != null)
    assert.equal(cluster.commands.length, 2)
  })

  it('rejects a malformed definition (bad name) at registration time', async () => {
    const defs: EsApiDefinition[] = [{ ...makeDef('health', 'cat'), name: 'Bad_Name' }]
    await assert.rejects(registerEsCommands(defs), /invalid.*name/i)
  })

  it('rejects a malformed definition (path missing leading slash) at registration time', async () => {
    const defs: EsApiDefinition[] = [{ ...makeDef('health', 'cat'), path: '_cat/health' }]
    await assert.rejects(registerEsCommands(defs), /path.*must start/i)
  })

  it('rejects a malformed definition (path token with no found_in: "path" field) at registration time', async () => {
    const defs: EsApiDefinition[] = [{
      ...makeDef('get', 'indices'),
      path: '/{index}',
      input: z.looseObject({}),  // {index} token in path but no found_in: "path" field
    }]
    await assert.rejects(registerEsCommands(defs), /path.*param.*index/i)
  })
})

describe('registerEsCommands - body field flattening', () => {
  it('registers body fields as individual --flags, not a --body flag', async () => {
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
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--settings'), `expected --settings flag, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--mappings'), `expected --mappings flag, got: ${optionNames.join(', ')}`)
    assert.ok(!optionNames.includes('--body'), '--body flag must not appear; body fields are top-level')
  })
})

describe('registerEsCommands - unified input schema', () => {
  it('registers a command with a unified input schema: flags, help text, and validation all work', async () => {
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
    const handle = await registerEsCommands(defs)
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

  it('registers a command using an externally defined input schema', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--index'), `expected --index, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--wait-for-active-shards'), `expected --wait-for-active-shards, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--settings'), `expected --settings, got: ${optionNames.join(', ')}`)
    assert.ok(optionNames.includes('--mappings'), `expected --mappings, got: ${optionNames.join(', ')}`)
  })

  it('validates an externally sourced schema paired with a local manifest without throwing', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    await assert.doesNotReject(registerEsCommands(defs))
  })

  it('--input-file flag is registered (external schema enables file/stdin merging)', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'create',
      namespace: 'indices',
      description: 'Creates a new index',
      method: 'PUT',
      path: '/{index}',
      input: externalCreateSchema,
    }]
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands[0]?.commands[0]
    assert.ok(cmd != null)
    const optionNames = cmd.options.map((o) => o.long)
    assert.ok(optionNames.includes('--input-file'), `expected --input-file flag for stdin/file merging`)
  })
})

describe('registerEsCommands - help groups', () => {
  it('namespace commands belong to the "API namespaces" group', async () => {
    const defs: EsApiDefinition[] = [makeDef('health', 'cat'), makeDef('create', 'indices')]
    const handle = await registerEsCommands(defs)
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null)
    assert.equal(cat.helpGroup(), 'API namespaces')
    const idx = handle.commands.find((c) => c.name() === 'indices')
    assert.ok(idx != null)
    assert.equal(idx.helpGroup(), 'API namespaces')
  })

  it('helpers group belongs to the "Helpers" group', async () => {
    const handle = await registerEsCommands([])
    const helpers = handle.commands.find((c) => c.name() === 'helpers')
    assert.ok(helpers != null)
    assert.equal(helpers.helpGroup(), 'Helpers')
  })

  it('known root-level commands are assigned to their domain group', async () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('search'),
      makeRootDef('get'),
      makeRootDef('count'),
      makeRootDef('put-script'),
      makeRootDef('ping'),
      makeRootDef('reindex-rethrottle'),
    ]
    const handle = await registerEsCommands(defs)
    const groupOf = (name: string) => handle.commands.find((c) => c.name() === name)?.helpGroup()
    assert.equal(groupOf('search'), 'Search')
    assert.equal(groupOf('get'), 'Documents')
    assert.equal(groupOf('count'), 'Analysis')
    assert.equal(groupOf('put-script'), 'Scripts')
    assert.equal(groupOf('ping'), 'Cluster')
    assert.equal(groupOf('reindex-rethrottle'), 'Advanced')
  })

  it('unknown root-level commands fall back to "Other commands"', async () => {
    const defs: EsApiDefinition[] = [makeRootDef('some-new-command')]
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands.find((c) => c.name() === 'some-new-command')
    assert.ok(cmd != null)
    assert.equal(cmd.helpGroup(), 'Other commands')
  })

  it('root-level commands appear in section order: Documents before Search before Analysis', async () => {
    const defs: EsApiDefinition[] = [
      makeRootDef('search'),
      makeRootDef('count'),
      makeRootDef('get'),
    ]
    const handle = await registerEsCommands(defs)
    const rootCmds = handle.commands.filter((c) => c.name() !== 'helpers')
    const names = rootCmds.map((c) => c.name())
    assert.ok(names.indexOf('get') < names.indexOf('search'), 'Documents (get) should precede Search (search)')
    assert.ok(names.indexOf('search') < names.indexOf('count'), 'Search (search) should precede Analysis (count)')
  })
})

describe('registerEsCommands - built-in API surface', () => {
  it('all built-in API schemas are JSON-Schema-serializable', async () => {
    // Loading all 560 Zod schema modules simultaneously occupies ~5 GB of heap.
    // V8 can dynamically lower the effective heap limit under memory pressure even
    // when --max-old-space-size is set, causing OOM in the shared test-runner process.
    // Spawning a dedicated child process gives the validation a clean 6 GB V8 isolate
    // with no competing allocations from the test runner or other test modules.
    const { spawnSync } = await import('node:child_process')
    const { fileURLToPath } = await import('node:url')
    // fileURLToPath handles Windows paths correctly (URL.pathname gives /C:/... on Windows)
    const script = fileURLToPath(new URL('../../scripts/validate-es-schemas.mts', import.meta.url))
    // Bun runs this test suite in CI and understands TypeScript natively — no tsx
    // loader or --max-old-space-size flag needed. Under Node, both are required.
    // Always use process.execPath (guaranteed correct binary) rather than a bare
    // 'bun' or 'node' string that depends on PATH resolution in the child env.
    const isBun = 'bun' in process.versions
    const args = isBun
      ? [script]
      : ['--max-old-space-size=6144', '--import', 'tsx/esm', script]
    const result = spawnSync(process.execPath, args, { encoding: 'utf-8', timeout: 120_000 })
    assert.strictEqual(result.status, 0, `Schema validation failed:\n${result.stderr}`)
  })

  it('throws at registration time when a schema contains z.date()', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'search',
      description: 'Search',
      method: 'GET',
      path: '/_search',
      input: z.looseObject({
        timestamp: z.date().optional().describe('A JS Date - not valid in a REST API schema').meta({ found_in: 'query' }),
      }),
    }]
    await assert.rejects(registerEsCommands(defs), /Date cannot be represented in JSON Schema/)
  })
})

describe('registerEsCommandsLazy', () => {
  it('returns an OpaqueCommandHandle named "es" with no argv sniff match', async () => {
    // Pass arbitrary argv that does not target any specific leaf → all stubs
    const handle = await registerEsCommandsLazy({ argv: ['node', 'elastic', 'es'] })
    assert.equal(handle.name(), 'es')
    assert.ok(handle.commands.length > 0, 'should have at least one child (namespace or root stub)')
  })

  it('contains helpers group as a stub when helpers is not invoked', async () => {
    const handle = await registerEsCommandsLazy({ argv: ['node', 'elastic', 'es'] })
    const helpers = handle.commands.find((c) => c.name() === 'helpers')
    assert.ok(helpers != null, 'should have a helpers command')
  })

  it('loads helpers group fully when es helpers is invoked', async () => {
    const handle = await registerEsCommandsLazy({ argv: ['node', 'elastic', 'es', 'helpers'] })
    const helpers = handle.commands.find((c) => c.name() === 'helpers')
    assert.ok(helpers != null, 'should have a helpers command')
    // When helpers is invoked, the group should be fully populated (> 0 subcommands)
    assert.ok(helpers.commands.length > 0, 'helpers should have sub-commands when invoked')
  })

  it('sniffs a namespaced leaf and expands that namespace fully', async () => {
    // cat health is a real leaf in the manifest
    const handle = await registerEsCommandsLazy({ argv: ['node', 'elastic', 'es', 'cat', 'health'] })
    const cat = handle.commands.find((c) => c.name() === 'cat')
    assert.ok(cat != null, 'cat namespace should be present')
    // The invoked namespace (cat) should have its leaves fully populated
    assert.ok(cat.commands.length > 0, 'cat namespace should have leaf commands when sniffed')
  })

  it('sniffs a root-level leaf command', async () => {
    // 'search' is a root-level command (no namespace)
    const handle = await registerEsCommandsLazy({ argv: ['node', 'elastic', 'es', 'search'] })
    const search = handle.commands.find((c) => c.name() === 'search')
    assert.ok(search != null, 'root-level search command should be present')
  })
})

describe('registerEsCommands - responseType and intent', () => {
  it('registers formatOutput for text responseType', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'explain',
      description: 'Explain something',
      method: 'GET',
      path: '/_explain',
      responseType: 'text',
    }]
    // Should register without error and produce a handle
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands.find((c) => c.name() === 'explain')
    assert.ok(cmd != null, 'command should be registered')
  })

  it('propagates explicit intent override on a definition', async () => {
    const defs: EsApiDefinition[] = [{
      name: 'reindex',
      description: 'Reindex data',
      method: 'POST',
      path: '/_reindex',
      intent: { verb: 'write', object: 'index' },
    }]
    const handle = await registerEsCommands(defs)
    const cmd = handle.commands.find((c) => c.name() === 'reindex')
    assert.ok(cmd != null, 'command should be registered with intent')
  })
})
