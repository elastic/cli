/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NAMESPACES } from '../src/namespaces.ts'

describe('nightshift namespace', () => {
  it('exposes the generated chat message command as `ask`, pinned to the investigation agent', async () => {
    const ns = NAMESPACES.find(n => n.name === 'nightshift')
    assert.ok(ns != null)
    const group = await ns.load()
    assert.equal(group.name(), 'nightshift')
    const ask = group.commands.find(c => c.name() === 'ask')
    assert.ok(ask != null)
    const flags = ask.options.map(o => o.long)
    assert.ok(flags.includes('--message'))
    assert.equal(flags.includes('--agent-id'), false)
    assert.deepEqual(ask.registeredArguments.map(a => a.name()), ['message'])
  })
})
