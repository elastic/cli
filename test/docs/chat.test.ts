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
})
