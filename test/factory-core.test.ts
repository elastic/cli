/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import {
  RawJsonValue,
  validateName,
  setHidden,
  isHidden,
  isStubGroup,
  stripTransportMeta,
  commandPath,
  defineGroup,
} from '../src/factory-core.ts'

describe('factory-core', () => {
  it('validateName accepts kebab-case and rejects empty or uppercase', () => {
    assert.doesNotThrow(() => validateName('get-spaces', 'command'))
    assert.throws(() => validateName('', 'command'), /invalid command name/)
    assert.throws(() => validateName('Get', 'group'), /invalid group name/)
  })

  it('setHidden and isHidden toggle the hidden bit', () => {
    const cmd = new Command('ping')
    assert.equal(isHidden(cmd), false)
    setHidden(cmd, true)
    assert.equal(isHidden(cmd), true)
    setHidden(cmd, false)
    assert.equal(isHidden(cmd), false)
  })

  it('isStubGroup is true only for an empty group', () => {
    const empty = defineGroup({ name: 'cat', description: 'Cat' })
    assert.equal(isStubGroup(empty), true)
    const child = new Command('health')
    const populated = defineGroup({ name: 'cat', description: 'Cat' }, child)
    assert.equal(isStubGroup(populated), false)
    assert.equal(isStubGroup(new Command('ping')), false)
  })

  it('stripTransportMeta drops routing keys and keeps user-facing ones', () => {
    assert.deepEqual(
      stripTransportMeta({
        'x-found-in': 'path',
        'x-body-root': true,
        'x-deprecated': true,
        type: 'string',
        nested: { 'x-method': 'GET', ok: true },
      }),
      { 'x-deprecated': true, type: 'string', nested: { ok: true } }
    )
    assert.deepEqual(stripTransportMeta(['a', 1]), ['a', 1])
    assert.equal(stripTransportMeta(null), null)
    assert.equal(stripTransportMeta('x'), 'x')
  })

  it('commandPath walks the parent chain', () => {
    const root = new Command('elastic')
    const child = new Command('kb')
    root.addCommand(child)
    assert.equal(commandPath(child), 'elastic kb')
    assert.equal(commandPath(root), 'elastic')
  })

  it('RawJsonValue stores the raw string and parsed value', () => {
    const v = new RawJsonValue('{"a":1}', { a: 1 })
    assert.equal(v.raw, '{"a":1}')
    assert.deepEqual(v.parsed, { a: 1 })
  })
})
