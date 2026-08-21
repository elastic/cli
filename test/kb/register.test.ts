/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateKbApiDefinition } from '../../src/kb/types.ts'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { registerKbCommands, registerKbCommandsLazy } from '../../src/kb/register.ts'
import type { KbApiDefinition } from '../../src/kb/types.ts'

function hasDryRun (cmd: { options: ReadonlyArray<{ flags: string }> }): boolean {
  return cmd.options.some((o) => o.flags.includes('dry-run'))
}

describe('validateKbApiDefinition against the real Kibana manifest', () => {
  it('passes for every definition, with no allowlisted exceptions', async () => {
    const defs = await loadAllKbApis()
    const failures: string[] = []
    for (const def of defs) {
      try {
        validateKbApiDefinition(def)
      } catch (err) {
        failures.push(`${def.namespace} ${def.name}: ${(err as Error).message}`)
      }
    }
    assert.deepEqual(failures, [])
  })
})

describe('registration-time protection against upstream regressions', () => {
  it('throws instead of registering a command with a literal {id} URL', () => {
    // Constructed, not loaded: no real definition has a path placeholder missing from
    // `x-found-in: "path"` as of @elastic/schemas 0.5.1. This asserts registration still
    // refuses such a definition if a future release regresses.
    const def: KbApiDefinition = {
      name: 'put-spaces-space-id',
      namespace: 'spaces',
      description: 'Update a space',
      method: 'PUT',
      path: '/api/spaces/space/{id}',
      input: {
        type: 'object',
        properties: { name: { type: 'string', 'x-found-in': 'body' } },
      },
    }

    assert.throws(() => registerKbCommands([def]), /\{id\}/)
  })

  it('rejects an invalid name, namespace, or path', () => {
    const base: KbApiDefinition = {
      name: 'get',
      namespace: 'spaces',
      description: 'List',
      method: 'GET',
      path: '/api/spaces/space',
    }
    assert.throws(() => validateKbApiDefinition({ ...base, name: 'Get' }), /invalid name/)
    assert.throws(() => validateKbApiDefinition({ ...base, namespace: '1spaces' }), /invalid namespace/)
    assert.throws(() => validateKbApiDefinition({ ...base, path: 'api/spaces' }), /path must start/)
  })

  it('accepts a definition with no input schema', () => {
    assert.doesNotThrow(() => validateKbApiDefinition({
      name: 'get',
      namespace: 'spaces',
      description: 'List',
      method: 'GET',
      path: '/api/spaces/space',
    }))
  })

  it('throws on a duplicate command name in the same namespace', () => {
    const def: KbApiDefinition = {
      name: 'get',
      namespace: 'spaces',
      description: 'List',
      method: 'GET',
      path: '/api/spaces/space',
    }
    assert.throws(() => registerKbCommands([def, { ...def }]), /duplicate command name "get"/)
  })

  it('registers HEAD as read-only and text responseType without an input schema', () => {
    const handle = registerKbCommands([{
      name: 'ping',
      namespace: 'misc',
      description: 'Ping',
      method: 'HEAD',
      path: '/api/status',
      responseType: 'text',
      intent: { requiresAuth: false },
    }])
    const group = handle.commands.find((c) => c.name() === 'misc')
    const cmd = group?.commands.find((c) => c.name() === 'ping')
    assert.ok(cmd != null)
  })
})

describe('registerKbCommandsLazy', () => {
  it('builds namespace stubs when argv does not name a leaf', async () => {
    const handle = await registerKbCommandsLazy({ argv: ['node', 'elastic', 'stack', 'kb'] })
    assert.equal(handle.name(), 'kb')
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    assert.ok(spaces != null)
    const leaf = spaces.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), false)
  })

  it('loads the sniffed namespaced leaf as a real command', async () => {
    const handle = await registerKbCommandsLazy({
      argv: ['node', 'elastic', 'stack', 'kb', 'spaces', 'get-spaces-space'],
    })
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    const leaf = spaces?.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), true)
  })

  it('accepts the kibana alias in argv', async () => {
    const handle = await registerKbCommandsLazy({
      argv: ['node', 'elastic', 'stack', 'kibana', 'spaces', 'get-spaces-space'],
    })
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    const leaf = spaces?.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), true)
  })

  it('sniffs a leaf by name when the namespace token is omitted', async () => {
    const handle = await registerKbCommandsLazy({
      argv: ['node', 'elastic', 'kb', 'get-spaces-space'],
    })
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    const leaf = spaces?.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), true)
  })

  it('stays on stubs when the namespace is given without a leaf', async () => {
    const handle = await registerKbCommandsLazy({
      argv: ['node', 'elastic', 'kb', 'spaces'],
    })
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    const leaf = spaces?.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), false)
  })

  it('stays on stubs when the leaf name is unknown', async () => {
    const handle = await registerKbCommandsLazy({
      argv: ['node', 'elastic', 'kb', 'spaces', 'not-a-command'],
    })
    const spaces = handle.commands.find((c) => c.name() === 'spaces')
    const leaf = spaces?.commands.find((c) => c.name() === 'get-spaces-space')
    assert.ok(leaf != null)
    assert.equal(hasDryRun(leaf), false)
  })

  it('builds stubs when argv has no kb token', async () => {
    const handle = await registerKbCommandsLazy({ argv: ['node', 'elastic', 'es'] })
    assert.equal(handle.name(), 'kb')
    assert.ok(handle.commands.length > 0)
  })
})
