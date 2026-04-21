/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAskCommand } from '../../src/docs/ask.ts'
import type { AskStreamEvent } from '../../src/docs/client.ts'

function streamFrom (chunks: string[]): () => AsyncGenerator<AskStreamEvent> {
  return async function* () {
    for (const c of chunks) yield { kind: 'chunk' as const, text: c }
  }
}

describe('createAskCommand', () => {
  it('creates a command named "ask"', () => {
    const cmd = createAskCommand()
    assert.equal(cmd.name(), 'ask')
  })

  it('has a required "question" positional argument', () => {
    const cmd = createAskCommand()
    assert.equal(cmd.registeredArguments.length, 1)
    assert.equal(cmd.registeredArguments[0].name(), 'question')
  })

  it('streams the answer to stdout via the rendered markdown', async () => {
    const written: string[] = []
    const gen = streamFrom(['Hello answer'])
    const cmd = createAskCommand({
      docsAskStream: gen,
      stdout: { write: (s) => { written.push(s); return true } },
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
    await cmd.parseAsync(['what is elasticsearch'], { from: 'user' })

    assert.ok(written.join('').includes('Hello answer'))
  })

  it('returns a missing_input error when the question is empty (exit 1)', async () => {
    const cmd = createAskCommand({
      docsAskStream: streamFrom([]),
      stdout: { write: () => true },
      stderr: { write: () => true },
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync(['   '], { from: 'user' })
    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })

  it('returns a docs_error when the stream throws', async () => {
    const cmd = createAskCommand({
      docsAskStream: async function* () {
        throw new Error('network down')
        yield { kind: 'chunk', text: '' } // unreachable, keeps generator typed
      },
      stdout: { write: () => true },
      stderr: { write: () => true },
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync(['q'], { from: 'user' })
    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })

  it('starts a spinner when stderr is a TTY (interactive mode)', async () => {
    const prevIsTTY = process.stderr.isTTY
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
    try {
      const written: string[] = []
      const stderrWrites: string[] = []
      const cmd = createAskCommand({
        docsAskStream: streamFrom(['answer text']),
        stdout: { write: (s) => { written.push(s); return true } },
        stderr: { write: (s) => { stderrWrites.push(s); return true } },
      })
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      await cmd.parseAsync(['q'], { from: 'user' })
      assert.ok(written.join('').includes('answer text'))
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: prevIsTTY, configurable: true })
    }
  })

  it('returns structured JSON with buffered answer when --json is active', async () => {
    const captured: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((s: string) => { captured.push(s); return true }) as typeof process.stdout.write
    try {
      const cmd = createAskCommand({
        docsAskStream: streamFrom(['chunk1', ' chunk2']),
        stdout: { write: () => true },
        stderr: { write: () => true },
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

  it('stringifies non-Error thrown values into the docs_error message', async () => {
    const stderrWrites: string[] = []
    const cmd = createAskCommand({
      docsAskStream: async function* () {
        throw 'plain string failure'
        yield { kind: 'chunk', text: '' }
      },
      stdout: { write: () => true },
      stderr: { write: (s) => { stderrWrites.push(s); return true } },
    })
    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    await cmd.parseAsync(['q'], { from: 'user' })
    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })
})
