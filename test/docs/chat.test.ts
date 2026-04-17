/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createChatCommand } from '../../src/docs/chat.ts'
import type { AskStreamEvent } from '../../src/docs/client.ts'

function streamFrom (chunks: string[]): () => AsyncGenerator<AskStreamEvent> {
  return async function* () {
    for (const c of chunks) yield { kind: 'chunk' as const, text: c }
  }
}

describe('createChatCommand', () => {
  it('creates a command named "chat"', () => {
    const cmd = createChatCommand()
    assert.equal(cmd.name(), 'chat')
  })

  it('has a required "question" positional argument', () => {
    const cmd = createChatCommand()
    assert.equal(cmd.registeredArguments.length, 1)
    assert.equal(cmd.registeredArguments[0].name(), 'question')
  })

  it('streams the opening answer to stdout (non-interactive)', async () => {
    const written: string[] = []
    const cmd = createChatCommand({
      docsAskStream: streamFrom(['chat answer']),
      stdout: { write: (s) => { written.push(s); return true } },
      stderr: { write: () => true },
      getStdin: () => Readable.from([]),
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
    await cmd.parseAsync(['what is search'], { from: 'user' })

    assert.ok(written.join('').includes('chat answer'))
  })

  it('returns missing_input when the question is empty', async () => {
    const cmd = createChatCommand({
      docsAskStream: streamFrom([]),
      stdout: { write: () => true },
      stderr: { write: () => true },
      getStdin: () => Readable.from([]),
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync([''], { from: 'user' })
    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })

  it('writes an Error line to stderr when the stream throws', async () => {
    const stderrWrites: string[] = []
    const cmd = createChatCommand({
      docsAskStream: async function* () {
        throw new Error('boom')
        yield { kind: 'chunk', text: '' }
      },
      stdout: { write: () => true },
      stderr: { write: (s) => { stderrWrites.push(s); return true } },
      getStdin: () => Readable.from([]),
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync(['hello'], { from: 'user' })
    assert.ok(stderrWrites.join('').includes('Error: boom'))
  })

  it('enters the interactive follow-up loop when stderr is a TTY and exits on empty input', async () => {
    const prevIsTTY = process.stderr.isTTY
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
    try {
      const written: string[] = []
      // stdin emits two lines: one follow-up question, then an empty line to quit
      const stdinStream = Readable.from(['follow up?\n', '\n'])

      const cmd = createChatCommand({
        docsAskStream: streamFrom(['answer']),
        stdout: { write: (s) => { written.push(s); return true } },
        stderr: { write: () => true },
        getStdin: () => stdinStream,
      })
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      await cmd.parseAsync(['opening'], { from: 'user' })

      // at least the opening answer was streamed
      assert.ok(written.join('').includes('answer'))
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: prevIsTTY, configurable: true })
    }
  })

  it('returns structured JSON with buffered answer when --json is active', async () => {
    const captured: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((s: string) => { captured.push(s); return true }) as typeof process.stdout.write
    try {
      const cmd = createChatCommand({
        docsAskStream: streamFrom(['chunk1', ' chunk2']),
        stdout: { write: () => true },
        stderr: { write: () => true },
        getStdin: () => Readable.from([]),
      })
      cmd.option('--json', 'output as JSON')
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      await cmd.parseAsync(['what is elasticsearch', '--json'], { from: 'user' })

      const output = captured.join('')
      const parsed = JSON.parse(output)
      assert.equal(parsed.answer, 'chunk1 chunk2')
    } finally {
      process.stdout.write = origWrite
    }
  })

  it('stringifies non-Error thrown values into the stderr message', async () => {
    const stderrWrites: string[] = []
    const cmd = createChatCommand({
      docsAskStream: async function* () {
        throw 'plain string failure'
        yield { kind: 'chunk', text: '' }
      },
      stdout: { write: () => true },
      stderr: { write: (s) => { stderrWrites.push(s); return true } },
      getStdin: () => Readable.from([]),
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync(['hello'], { from: 'user' })
    assert.ok(stderrWrites.join('').includes('Error: plain string failure'))
  })
})
