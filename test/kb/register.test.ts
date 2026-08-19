/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateKbApiDefinition } from '../../src/kb/types.ts'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { registerKbCommands } from '../../src/kb/register.ts'
import type { KbApiDefinition } from '../../src/kb/types.ts'

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
})
