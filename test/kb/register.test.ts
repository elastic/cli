/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateKbApiDefinition } from '../../src/kb/types.ts'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { createKbHandler } from '../../src/kb/handler.ts'
import type { KbApiDefinition } from '../../src/kb/types.ts'
import type { ParsedResult } from '../../src/factory.ts'

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

describe('createKbHandler invocation-time protection against upstream regressions', () => {
  it('errors instead of sending a request to a literal {id} URL', async () => {
    // Constructed, not loaded: no real definition has a path placeholder missing from
    // `x-found-in: "path"` as of @elastic/schemas 0.5.1. This asserts the handler still
    // refuses to build such a URL if a future release regresses.
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

    const handler = createKbHandler(def)
    const parsed = { input: { id: 'my-space', name: 'x' } } as unknown as ParsedResult
    const result = await handler(parsed)

    assert.ok(result != null && typeof result === 'object' && 'error' in result)
    const error = (result as { error: { code: string, message: string } }).error
    assert.equal(error.code, 'invalid_definition')
    assert.match(error.message, /\{id\}/)
  })
})
