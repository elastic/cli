/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import { registerKbEsqlHelpers } from '../../../src/kb/helpers/register.ts'

describe('registerKbEsqlHelpers', () => {
  it('returns a command group named "esql"', () => {
    const group = registerKbEsqlHelpers()
    assert.ok(group instanceof Command)
    assert.equal(group.name(), 'esql')
  })

  it('has a description', () => {
    const group = registerKbEsqlHelpers()
    assert.ok(group.description().length > 0)
  })

  it('includes the preview-url command', () => {
    const group = registerKbEsqlHelpers()
    const names = (group.commands as Command[]).map((c) => c.name())
    assert.ok(names.includes('preview-url'), `expected preview-url in ${names.join(', ')}`)
  })
})
