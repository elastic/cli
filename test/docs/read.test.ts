/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createReadCommand } from '../../src/docs/read.ts'

describe('createReadCommand', () => {
  it('creates a command named "read"', () => {
    const cmd = createReadCommand()
    assert.equal(cmd.name(), 'read')
  })

  it('has a positional argument named "path"', () => {
    const cmd = createReadCommand()
    const args = cmd.registeredArguments
    assert.equal(args.length, 1)
    assert.equal(args[0].name(), 'path')
  })

  it('has a --raw flag', () => {
    const cmd = createReadCommand()
    const optNames = cmd.options.map((o) => o.long)
    assert.ok(optNames.includes('--raw'))
  })

  it('writes rendered markdown to stdout', async () => {
    const written: string[] = []
    const cmd = createReadCommand({
      resolveDocsPath: async (input) => input,
      docsRead: async () => '# Hello\n\nWorld',
      stdout: { write: (s) => { written.push(s); return true } },
    })

    cmd.exitOverride()
    await cmd.parseAsync(['/reference/test'], { from: 'user' })

    assert.ok(written.join('').length > 0)
  })

  it('writes raw markdown when --raw is passed', async () => {
    const written: string[] = []
    const cmd = createReadCommand({
      resolveDocsPath: async (input) => input,
      docsRead: async () => '# Raw markdown\n\nContent here',
      stdout: { write: (s) => { written.push(s); return true } },
    })

    cmd.exitOverride()
    await cmd.parseAsync(['/reference/test', '--raw'], { from: 'user' })

    assert.equal(written.join(''), '# Raw markdown\n\nContent here')
  })

  it('sets exitCode=1 when docsRead throws', async () => {
    const cmd = createReadCommand({
      resolveDocsPath: async (input) => input,
      docsRead: async () => { throw new Error('not found') },
      stdout: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })

    await cmd.parseAsync(['/bad-path'], { from: 'user' })

    assert.equal(process.exitCode, 1)
    process.exitCode = 0 // reset
  })
})
