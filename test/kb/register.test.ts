/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateKbApiDefinition } from '../../src/kb/types.ts'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { createKbHandler } from '../../src/kb/handler.ts'
import { KNOWN_UPSTREAM_PATH_PARAM_MISMATCHES } from '../../src/kb/register.ts'
import type { ParsedResult } from '../../src/factory.ts'

describe('validateKbApiDefinition against the real Kibana manifest', () => {
  it('passes for every definition except the known upstream mismatches', async () => {
    const defs = await loadAllKbApis()
    const unexpectedFailures: string[] = []
    for (const def of defs) {
      const key = `${def.namespace} ${def.name}`
      try {
        validateKbApiDefinition(def)
        assert.ok(!KNOWN_UPSTREAM_PATH_PARAM_MISMATCHES.has(key), `${key} is allowlisted but now passes validation — remove it from the allowlist`)
      } catch (err) {
        if (!KNOWN_UPSTREAM_PATH_PARAM_MISMATCHES.has(key)) unexpectedFailures.push(`${key}: ${(err as Error).message}`)
      }
    }
    assert.deepEqual(unexpectedFailures, [])
  })
})

describe('createKbHandler invocation-time protection for allowlisted definitions', () => {
  it('errors instead of sending a request to a literal {id} URL', async () => {
    const defs = await loadAllKbApis()
    const def = defs.find((d) => d.namespace === 'spaces' && d.name === 'put-spaces-space-id')
    assert.ok(def != null, 'expected put-spaces-space-id to exist in the manifest')

    const handler = createKbHandler(def)
    const parsed = { input: { id: 'my-space', name: 'x' } } as unknown as ParsedResult
    const result = await handler(parsed)

    assert.ok(result != null && typeof result === 'object' && 'error' in result)
    const error = (result as { error: { code: string, message: string } }).error
    assert.equal(error.code, 'invalid_definition')
    assert.match(error.message, /\{id\}/)
  })
})
