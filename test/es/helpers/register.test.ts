/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import { registerHelperCommands } from '../../../src/es/helpers/register.ts'

describe('registerHelperCommands', () => {
  it('returns a command group named "helpers"', () => {
    const group = registerHelperCommands()
    assert.ok(group instanceof Command)
    assert.equal(group.name(), 'helpers')
  })

  it('has a description', () => {
    const group = registerHelperCommands()
    assert.ok(group.description().length > 0)
  })
})
