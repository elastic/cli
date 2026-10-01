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

describe('unknown command suggestions', () => {
  function invokeErr (handle: Command, argv: string[]): string {
    let err = ''
    handle.exitOverride()
    handle.configureOutput({ writeErr: (s) => { err += s } })
    try {
      handle.parse(argv, { from: 'user' })
    } catch {
      // CommanderError from exitOverride
    }
    return err
  }

  it('suggests the closest sibling for a near misspelling', () => {
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      new Command('indices'),
      new Command('search'),
    )
    const err = invokeErr(group, ['indice'])
    assert.match(err, /unknown command: indice/)
    assert.match(err, /Did you mean indices/)
    assert.doesNotMatch(err, /search/)
  })

  it('omits a suggestion when edit distance is large', () => {
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      new Command('indices'),
    )
    const err = invokeErr(group, ['zzzzzzzz'])
    assert.match(err, /unknown command: zzzzzzzz/)
    assert.doesNotMatch(err, /Did you mean/)
  })

  it('caps suggestions at three equally close names', () => {
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      new Command('foo1'),
      new Command('foo2'),
      new Command('foo3'),
      new Command('foo4'),
    )
    const err = invokeErr(group, ['foo'])
    assert.match(err, /Did you mean one of foo1, foo2, foo3/)
    assert.doesNotMatch(err, /foo4/)
  })

  it('does not suggest a hidden sibling', () => {
    const hidden = new Command('indices')
    setHidden(hidden, true)
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      hidden,
      new Command('info'),
    )
    const err = invokeErr(group, ['indice'])
    assert.doesNotMatch(err, /Did you mean/)
    assert.doesNotMatch(err, /indices/)
  })

  it('does not suggest for adversarial unknown tokens', () => {
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      new Command('indices'),
    )
    for (const token of ['../', '?#', '/etc/passwd']) {
      const err = invokeErr(group, [token])
      assert.match(err, new RegExp(`unknown command: ${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
      assert.doesNotMatch(err, /Did you mean/)
    }
  })

  it('suggests after the option separator', () => {
    const group = defineGroup(
      { name: 'es', description: 'ES' },
      new Command('indices'),
    )
    const err = invokeErr(group, ['--', 'indice'])
    assert.match(err, /unknown command: indice/)
    assert.match(err, /Did you mean indices/)
  })

  it('suggests the closest option on a group', () => {
    const group = defineGroup({ name: 'es', description: 'ES' }, new Command('search'))
    group.option('--timeout <n>', 'timeout')
    const err = invokeErr(group, ['--timeot'])
    assert.match(err, /unknown option '--timeot'/)
    assert.match(err, /Did you mean --timeout/)
  })

  it('suggests a parent option from the group', () => {
    const root = new Command('elastic')
    root.option('--json', 'json')
    const group = defineGroup({ name: 'es', description: 'ES' }, new Command('search'))
    root.addCommand(group)
    const err = invokeErr(group, ['--jsn'])
    assert.match(err, /unknown option '--jsn'/)
    assert.match(err, /Did you mean --json/)
  })

  it('omits an option suggestion when the flag is far from any name', () => {
    const group = defineGroup({ name: 'es', description: 'ES' }, new Command('search'))
    group.option('--timeout <n>', 'timeout')
    const err = invokeErr(group, ['--zzzzzzzz'])
    assert.match(err, /unknown option '--zzzzzzzz'/)
    assert.doesNotMatch(err, /Did you mean/)
  })
})
