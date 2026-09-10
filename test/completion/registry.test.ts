/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defaultRegistry } from '../../src/completion/registry.ts'

describe('defaultRegistry', () => {
  it('registers a completer for --use-context', () => {
    assert.equal(typeof defaultRegistry.get('--use-context'), 'function')
  })

  it('returns undefined for unregistered flags', () => {
    assert.equal(defaultRegistry.get('--json'), undefined)
    assert.equal(defaultRegistry.get('--index'), undefined)
    assert.equal(defaultRegistry.get(''), undefined)
  })

  it('the --use-context completer returns an array of strings (or empty)', async () => {
    const completer = defaultRegistry.get('--use-context')
    assert.ok(completer != null)
    const result = await completer()
    assert.ok(Array.isArray(result))
    for (const name of result) assert.equal(typeof name, 'string')
  })
})

describe('defaultRegistry -- positional completers', () => {
  it('registers a completer for config current-context set', () => {
    assert.equal(typeof defaultRegistry.getPositional?.('config current-context set'), 'function')
  })

  it('registers a completer for config context edit', () => {
    assert.equal(typeof defaultRegistry.getPositional?.('config context edit'), 'function')
  })

  it('registers a completer for config context remove', () => {
    assert.equal(typeof defaultRegistry.getPositional?.('config context remove'), 'function')
  })

  it('returns undefined for unregistered command paths', () => {
    assert.equal(defaultRegistry.getPositional?.('config context add'), undefined)
    assert.equal(defaultRegistry.getPositional?.('config context list'), undefined)
    assert.equal(defaultRegistry.getPositional?.(''), undefined)
  })
})
