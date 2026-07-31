/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadKbApisInFile } from '../../src/kb/apis.ts'

describe('loadKbApisInFile', () => {
  it('flattens post-alerting-rule-id\'s allOf body into top-level properties', async () => {
    const defs = await loadKbApisInFile('post_alerting_rule_id')
    const create = defs.find((d) => d.namespace === 'alerting' && d.name === 'post-alerting-rule-id')
    assert.ok(create?.input != null)

    const props = create.input['properties'] as Record<string, Record<string, unknown>>
    // path param stays present
    assert.equal(props['id']?.['x-found-in'], 'path')
    // body fields merged in from the allOf entry
    assert.ok('name' in props)
    assert.ok('schedule' in props)
    assert.equal(props['consumer']?.['type'], 'string')
    assert.equal(props['rule_type_id']?.['type'], 'string')
    assert.deepEqual(new Set(create.input['required'] as string[]), new Set(['id', 'name', 'consumer', 'schedule', 'rule_type_id']))
    assert.equal('allOf' in create.input, false)
  })

  it('loads a namespace file whose stem contains a dot', async () => {
    const defs = await loadKbApisInFile('get_agent_builder_a2a_agentid.json')
    assert.ok(defs.length > 0)
  })

  it('leaves no unresolved sidecar $refs in nested input schemas', async () => {
    const defs = await loadKbApisInFile('post_actions_connector_id')
    const create = defs.find((d) => d.name === 'post-actions-connector-id')
    assert.ok(create?.input != null)

    const refs: string[] = []
    JSON.stringify(create.input, (key, value) => {
      if (key === '$ref' && typeof value === 'string') refs.push(value)
      return value
    })
    assert.ok(refs.length > 0, 'expected the schema to contain $refs')
    assert.deepEqual(refs.filter((r) => !r.startsWith('#/$defs/')), [])

    const $defs = create.input['$defs'] as Record<string, unknown>
    for (const ref of refs) {
      assert.ok(ref.slice('#/$defs/'.length) in $defs, `missing $defs entry for ${ref}`)
    }
  })
})
