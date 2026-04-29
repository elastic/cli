/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createReadCommand } from '../../src/docs/read.ts'
import { _testSetStdinReader } from '../../src/factory.ts'

describe('createReadCommand', () => {
  it('creates a command named "read"', () => {
    const cmd = createReadCommand()
    assert.equal(cmd.name(), 'read')
  })

  it('has a required --path option', () => {
    const cmd = createReadCommand()
    assert.equal(cmd.registeredArguments.length, 0)
    const optNames = cmd.options.map((o) => o.long)
    assert.ok(optNames.includes('--path'))
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
    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--path', '/reference/test'], { from: 'user' })
    } finally { restoreStdin() }

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
    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--path', '/reference/test', '--raw'], { from: 'user' })
    } finally { restoreStdin() }

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

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--path', '/bad-path'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode, 1)
    process.exitCode = 0 // reset
  })
})
