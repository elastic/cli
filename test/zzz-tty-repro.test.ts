/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Minimal, isolated reproduction of the windows-latest hang seen in
// confirmation.test.ts's "TTY prompt" test. No sibling describes, no
// Object.defineProperty mutations, no --dry-run/--yes paths. Just the
// isTTYFn()===true + confirmReader seam, in complete isolation, to check
// whether the hang is inherent to this exact code path or an interaction
// with surrounding tests in the same file.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defineCommand, _testSetConfirmReader, _testSetIsTTY } from '../src/factory.ts'

describe('minimal tty repro', () => {
  it('single tty-true confirm-yes invocation', async () => {
    const r1 = _testSetIsTTY(true)
    const r2 = _testSetConfirmReader(async () => true)
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'delete',
      description: 'Delete a resource',
      intent: { destructive: true },
      handler: () => { handlerCalled = true; return {} },
    })
    const { Command } = await import('commander')
    const program = new Command('elastic')
    program.exitOverride()
    program.addCommand(cmd)
    cmd.exitOverride()
    try {
      await program.parseAsync(['delete'], { from: 'user' })
    } finally {
      r2(); r1()
    }
    assert.equal(handlerCalled, true)
  })
})
