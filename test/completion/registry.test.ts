/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defaultCompleters } from '../../src/completion/registry.ts'

describe('defaultCompleters', () => {
  it('registers a completer for --use-context', () => {
    assert.equal(typeof defaultCompleters.flags.get('--use-context'), 'function')
  })

  it('returns undefined for unregistered flags', () => {
    assert.equal(defaultCompleters.flags.get('--json'), undefined)
    assert.equal(defaultCompleters.flags.get('--index'), undefined)
    assert.equal(defaultCompleters.flags.get(''), undefined)
  })

  it('the --use-context completer returns an array of strings (or empty)', async () => {
    const completer = defaultCompleters.flags.get('--use-context')
    assert.ok(completer != null)
    const result = await completer()
    assert.ok(Array.isArray(result))
    for (const name of result) assert.equal(typeof name, 'string')
  })
})

describe('defaultCompleters -- positional completers', () => {
  it('registers a completer for config current-context set', () => {
    assert.equal(typeof defaultCompleters.positionals?.get('config current-context set'), 'function')
  })

  it('registers a completer for config context edit', () => {
    assert.equal(typeof defaultCompleters.positionals?.get('config context edit'), 'function')
  })

  it('registers a completer for config context remove', () => {
    assert.equal(typeof defaultCompleters.positionals?.get('config context remove'), 'function')
  })

  it('returns undefined for unregistered command paths', () => {
    assert.equal(defaultCompleters.positionals?.get('config context add'), undefined)
    assert.equal(defaultCompleters.positionals?.get('config context list'), undefined)
    assert.equal(defaultCompleters.positionals?.get(''), undefined)
  })
})
