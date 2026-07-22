/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createChatCommand } from '../../src/docs/chat.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
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

  it('has a required --question option', () => {
    const cmd = createChatCommand()
    assert.equal(cmd.registeredArguments.length, 0)
    const optNames = cmd.options.map((o) => o.long)
    assert.ok(optNames.includes('--question'))
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
    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--question', 'what is search'], { from: 'user' })
    } finally { restoreStdin() }

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

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--question', ''], { from: 'user' })
    } finally { restoreStdin() }
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

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--question', 'hello'], { from: 'user' })
    } finally { restoreStdin() }
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
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--question', 'opening'], { from: 'user' })
      } finally { restoreStdin() }

      // at least the opening answer was streamed
      assert.ok(written.join('').includes('answer'))
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: prevIsTTY, configurable: true })
    }
  })

  it('interactive follow-up loop never writes to the real process.stderr', async () => {
    const prevIsTTY = process.stderr.isTTY
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
    const origErrWrite = process.stderr.write
    const realWrites: string[] = []
    process.stderr.write = ((s: string) => { realWrites.push(s); return true }) as typeof process.stderr.write
    try {
      const stdinStream = Readable.from(['follow up?\n', '\n'])
      const cmd = createChatCommand({
        docsAskStream: streamFrom(['answer']),
        stdout: { write: () => true },
        stderr: { write: () => true },
        getStdin: () => stdinStream,
      })
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--question', 'opening'], { from: 'user' })
      } finally { restoreStdin() }

      assert.deepEqual(realWrites, [])
    } finally {
      process.stderr.write = origErrWrite
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
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--question', 'what is elasticsearch', '--json'], { from: 'user' })
      } finally { restoreStdin() }

      const output = captured.join('')
      const parsed = JSON.parse(output)
      assert.equal(parsed.answer, 'chunk1 chunk2')
    } finally {
      process.stdout.write = origWrite
    }
  })

  it('returns structured error JSON when --json stream throws', async () => {
    const captured: string[] = []
    const origStdout = process.stdout.write
    const origStderr = process.stderr.write
    process.stdout.write = ((s: string) => { captured.push(s); return true }) as typeof process.stdout.write
    process.stderr.write = ((s: string) => { captured.push(s); return true }) as typeof process.stderr.write
    try {
      const cmd = createChatCommand({
        docsAskStream: async function* () {
          throw new Error('network down')
          yield { kind: 'chunk', text: '' }
        },
        stdout: { write: (s) => { captured.push(s); return true } },
        stderr: { write: (s) => { captured.push(s); return true } },
        getStdin: () => Readable.from([]),
      })
      cmd.option('--json', 'output as JSON')
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: (s) => { captured.push(s) }, writeErr: (s) => { captured.push(s) } })
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--question', 'test', '--json'], { from: 'user' })
      } finally { restoreStdin() }

      const jsonChunk = captured.find(s => s.includes('"docs_error"'))
      assert.ok(jsonChunk != null, `Expected JSON error output, got: ${captured.join('')}`)
      const parsed = JSON.parse(jsonChunk)
      assert.equal(parsed.error.code, 'docs_error')
      assert.equal(parsed.error.message, 'network down')
    } finally {
      process.stdout.write = origStdout
      process.stderr.write = origStderr
      process.exitCode = 0
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

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--question', 'hello'], { from: 'user' })
    } finally { restoreStdin() }
    assert.ok(stderrWrites.join('').includes('Error: plain string failure'))
  })
})
