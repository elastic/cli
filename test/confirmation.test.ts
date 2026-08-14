/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { defineCommand, _testSetConfirmReader, _testSetIsTTY } from '../src/factory.ts'
import type { OpaqueCommandHandle } from '../src/factory.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function invokeAsync (handle: OpaqueCommandHandle, globalFlags: string[], argv: string[]): Promise<void> {
  const { Command } = await import('commander')
  const program = new Command('elastic')
  program.exitOverride()
  program.option('--json', 'Output in JSON format')
  program.addCommand(handle)
  handle.exitOverride()
  await program.parseAsync([...globalFlags, handle.name(), ...argv], { from: 'user' })
}

async function captureErrAsync (handle: OpaqueCommandHandle, globalFlags: string[], argv: string[]): Promise<string> {
  let err = ''
  handle.exitOverride()
  handle.configureOutput({ writeErr: (s) => { err += s } })
  const { Command } = await import('commander')
  const program = new Command('elastic')
  program.exitOverride()
  program.option('--json', 'Output in JSON format')
  program.addCommand(handle)
  try {
    await program.parseAsync([...globalFlags, handle.name(), ...argv], { from: 'user' })
  } catch { /* exitOverride / confirmation throw */ }
  return err
}

// ---------------------------------------------------------------------------
// All confirmation guard tests run serially inside one outer describe.
// node:test runs top-level describes concurrently by default. That concurrent
// execution creates async gaps (from `await import('commander')` inside the
// helpers) during which sibling describe hooks can mutate shared state such as
// the `isTTYFn` seam. Wrapping everything in `{ concurrency: false }` here
// serialises all execution and eliminates those races.
//
// Note: TTY state is always overridden via the `_testSetIsTTY` seam, never by
// `Object.defineProperty(process.stderr, 'isTTY', ...)`. Redefining that
// property directly replaces the stream's inherited getter with an own data
// property; "restoring" it afterwards with another `Object.defineProperty`
// call does not return the stream to its original state, and reliably hangs
// later TTY-path tests in the same file on Windows CI.
// ---------------------------------------------------------------------------
describe('confirmation guard', { concurrency: false }, () => {
  // -------------------------------------------------------------------------
  // Non-destructive commands
  // -------------------------------------------------------------------------

  describe('non-destructive commands', () => {
    it('proceeds without --yes and without confirmation prompt', async () => {
      const restore = _testSetIsTTY(false)
      try {
        let handlerCalled = false
        const cmd = defineCommand({
          name: 'ping',
          description: 'Ping the cluster',
          handler: () => { handlerCalled = true; return {} },
        })
        await invokeAsync(cmd, [], [])
        assert.equal(handlerCalled, true)
      } finally { restore() }
    })

    it('does not register --yes flag', () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping the cluster',
        handler: () => ({}),
      })
      assert.ok(!cmd.helpInformation().includes('--yes'), 'non-destructive command must not expose --yes')
    })
  })

  // -------------------------------------------------------------------------
  // Destructive commands: non-TTY (fail closed)
  // -------------------------------------------------------------------------

  describe('non-TTY fail-closed', () => {
    let restore: () => void

    beforeEach(() => { restore = _testSetIsTTY(false) })
    afterEach(() => { restore() })

    it('returns confirmation_required error without --yes', async () => {
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, [], [])
      assert.match(err, /Pass --yes to confirm this destructive action/)
    })

    it('does not invoke handler when confirmation is missing', async () => {
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => { handlerCalled = true; return {} },
      })
      await captureErrAsync(cmd, [], [])
      assert.equal(handlerCalled, false)
    })

    it('emits structured JSON error with --json flag', async () => {
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--json'], [])
      const parsed = JSON.parse(err) as { error: { code: string; message: string } }
      assert.equal(parsed.error.code, 'confirmation_required')
      assert.match(parsed.error.message, /--yes/)
    })

    it('requiresConfirmation intent also triggers the guard', async () => {
      const cmd = defineCommand({
        name: 'reset',
        description: 'Reset the resource',
        intent: { requiresConfirmation: true },
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, [], [])
      assert.match(err, /Pass --yes to confirm this destructive action/)
    })
  })

  // -------------------------------------------------------------------------
  // Destructive commands: --yes bypasses confirmation
  // -------------------------------------------------------------------------

  describe('--yes flag', () => {
    let restore: () => void

    beforeEach(() => { restore = _testSetIsTTY(false) })
    afterEach(() => { restore() })

    it('proceeds when --yes is passed', async () => {
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => { handlerCalled = true; return {} },
      })
      await invokeAsync(cmd, [], ['--yes'])
      assert.equal(handlerCalled, true)
    })

    it('destructive commands register --yes flag in help', () => {
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => ({}),
      })
      assert.ok(cmd.helpInformation().includes('--yes'), 'destructive command must expose --yes in help')
    })
  })

  // -------------------------------------------------------------------------
  // Destructive commands: TTY interactive prompt
  //
  // Both TTY paths (proceed and abort) run inside one `it` block so the two
  // async phases can share state without racing against sibling suites.
  // -------------------------------------------------------------------------

  describe('TTY prompt', () => {
    // node:test v22 / tsx bug: a suite with exactly one async test that yields
    // early (via `await import(...)`) may be closed prematurely by the runner,
    // causing the test to not appear in the TAP count. A second (instant) test
    // keeps the suite registration alive while the real test is running.
    it('confirm-reader seam restores state', () => {
      const r1 = _testSetIsTTY(false)
      const r2 = _testSetConfirmReader(async () => true)
      r2(); r1()
    })

    it('proceeds on yes, aborts on no', async () => {
      const diag = (msg: string): void => { process.stderr.write(`DIAG ${Date.now()} ${msg}\n`) }
      diag('start')
      // Case 1: reader returns true → confirmation guard passes, handler runs.
      // The handler throws after setting the flag so the factory never reaches
      // the process.stdout.write(renderText(...)) call and does not corrupt the
      // TAP stream (node:test flushes suite TAP output asynchronously; any
      // direct process.stdout.write from within a test can overwrite it).
      let r1 = _testSetIsTTY(true)
      let r2 = _testSetConfirmReader(async () => true)
      diag('seams set for case 1')
      let handlerCalled = false
      const cmdYes = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => { handlerCalled = true; throw new Error('stop_here') },
      })
      diag('cmdYes defined')
      try {
        await captureErrAsync(cmdYes, [], [])
        diag('case 1 captureErrAsync resolved')
      } finally { r2(); r1() }
      diag('case 1 seams restored')
      assert.equal(handlerCalled, true, 'handler must be called when TTY reader returns true')
      diag('case 1 assert passed')

      // Case 2: reader returns false → aborts before handler runs
      handlerCalled = false
      r1 = _testSetIsTTY(true)
      r2 = _testSetConfirmReader(async () => false)
      diag('seams set for case 2')
      const cmdNo = defineCommand({
        name: 'delete2',
        description: 'Delete a resource',
        intent: { destructive: true },
        handler: () => { handlerCalled = true; return {} },
      })
      diag('cmdNo defined')
      try {
        const err = await captureErrAsync(cmdNo, [], [])
        diag('case 2 captureErrAsync resolved')
        assert.equal(handlerCalled, false)
        assert.match(err, /Aborted/)
      } finally { r2(); r1() }
      diag('done')
    })
  })

  // -------------------------------------------------------------------------
  // --dry-run exits before the confirmation guard
  // -------------------------------------------------------------------------

  describe('--dry-run skip', () => {
    let restore: () => void

    beforeEach(() => { restore = _testSetIsTTY(false) })
    afterEach(() => { restore() })

    it('--dry-run skips confirmation and exits early', async () => {
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'delete',
        description: 'Delete a resource',
        intent: { destructive: true },
        input: { type: 'object', properties: {} },
        handler: () => { handlerCalled = true; return {} },
      })
      let stdout = ''
      const origWrite = process.stdout.write.bind(process.stdout)
      process.stdout.write = (s: string | Uint8Array) => { stdout += s; return true }
      try {
        await invokeAsync(cmd, [], ['--dry-run'])
      } finally {
        process.stdout.write = origWrite
      }
      assert.equal(handlerCalled, false)
      assert.match(stdout, /dry run/)
    })
  })
})
