/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import './setup-non-interactive.ts'

describe('setup-non-interactive stdout filter', () => {
  it('keeps TAP strings out of process.stdout captures', () => {
    const captured: string[] = []
    const orig = process.stdout.write
    process.stdout.write = ((s: unknown) => {
      if (typeof s === 'string') captured.push(s)
      return true
    }) as typeof process.stdout.write
    try {
      process.stdout.write('# Subtest: leaked\n')
      process.stdout.write('    # Subtest: indented\n')
      process.stdout.write('    1..6\n')
      process.stdout.write('{"ok":true}\n')
      assert.equal(captured.join(''), '{"ok":true}\n')
    } finally {
      process.stdout.write = orig
    }
  })
})
