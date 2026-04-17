/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { splitCompleteParagraph, streamAnswer, startSpinner } from '../../src/docs/stream.ts'
import type { AskStreamEvent } from '../../src/docs/client.ts'

function chunks (...texts: string[]): AsyncGenerator<AskStreamEvent> {
  return (async function* () {
    for (const t of texts) yield { kind: 'chunk' as const, text: t }
  })()
}

describe('splitCompleteParagraph', () => {
  it('returns null when no double newline is present', () => {
    assert.equal(splitCompleteParagraph('single paragraph text'), null)
  })

  it('splits on double newline', () => {
    assert.deepEqual(splitCompleteParagraph('first paragraph\n\nsecond paragraph'), ['first paragraph', 'second paragraph'])
  })

  it('does not split inside a fenced code block', () => {
    assert.equal(splitCompleteParagraph('```\nsome code\n\nmore code\n```'), null)
  })

  it('splits after a code block closes', () => {
    const result = splitCompleteParagraph('```\ncode\n```\n\nnext paragraph')
    assert.ok(result != null)
    assert.equal(result[1], 'next paragraph')
  })

  it('does not split on \\n\\n inside a code block with preceding text', () => {
    const text = 'intro\n\n```csharp\nusing X;\n\nvar y = 1;\n```\n\nafter'
    const [para] = splitCompleteParagraph(text)!
    assert.equal(para, 'intro')
    const [code] = splitCompleteParagraph('```csharp\nusing X;\n\nvar y = 1;\n```\n\nafter')!
    assert.ok(code.startsWith('```csharp'))
    assert.ok(code.endsWith('```'))
  })
})

describe('streamAnswer', () => {
  it('renders complete paragraphs incrementally and flushes remainder', async () => {
    const output: string[] = []
    const stdout = { write: (s: string) => { output.push(s); return true } }

    await streamAnswer(chunks('Hello world\n\n', 'Second paragraph'), (md) => md.trim(), stdout)

    assert.equal(output.length, 2)
    assert.equal(output[0], 'Hello world\n\n')
    assert.equal(output[1], 'Second paragraph\n')
  })

  it('strips <!--REFERENCES block — does not render it', async () => {
    const output: string[] = []
    const stdout = { write: (s: string) => { output.push(s); return true } }

    await streamAnswer(
      chunks('Answer text\n\n<!--REFERENCES\n[{"url":"https://x.com","title":"X"}]\n-->'),
      (md) => md.trim(), stdout
    )

    const joined = output.join('')
    assert.ok(joined.includes('Answer text'))
    assert.ok(!joined.includes('<!--'))
    assert.ok(!joined.includes('"url"'))
  })

  it('handles <!--REFERENCES marker split across chunks', async () => {
    async function* gen (): AsyncGenerator<AskStreamEvent> {
      yield { kind: 'chunk', text: 'Answer\n\n<!--REFER' }
      yield { kind: 'chunk', text: 'ENCES\n[{"url":"https://x.com","title":"X"}]\n-->' }
    }

    const output: string[] = []
    const stdout = { write: (s: string) => { output.push(s); return true } }

    await streamAnswer(gen(), (md) => md.trim(), stdout)

    const joined = output.join('')
    assert.ok(joined.includes('Answer'))
    assert.ok(!joined.includes('<!--'))
    assert.ok(!joined.includes('"url"'))
  })

  it('status events update the spinner phase without affecting output', async () => {
    const phases: string[] = []
    const spinner = { setPhase: (p: string) => { phases.push(p) }, stop: () => {} }
    const output: string[] = []

    async function* gen (): AsyncGenerator<AskStreamEvent> {
      yield { kind: 'status', message: 'Searching: foo…' }
      yield { kind: 'status', message: 'Generating answer…' }
      yield { kind: 'chunk', text: 'The answer' }
    }

    await streamAnswer(gen(), (md) => md.trim(), { write: (s) => { output.push(s); return true } }, spinner)

    assert.deepEqual(phases, ['Searching: foo…', 'Generating answer…'])
    assert.ok(output.join('').includes('The answer'))
  })

  it('stops the spinner when output begins', async () => {
    let stopped = false
    const spinner = { setPhase: () => {}, stop: () => { stopped = true } }

    await streamAnswer(chunks('Some content'), (md) => md, { write: () => true }, spinner)

    assert.ok(stopped)
  })

  it('handles an empty stream without error', async () => {
    const output: string[] = []
    await streamAnswer((async function* () {})(), (md) => md, { write: (s) => { output.push(s); return true } })
    assert.equal(output.length, 0)
  })

  it('stops the spinner at end of stream when no output was flushed', async () => {
    let stopped = false
    const spinner = { setPhase: () => {}, stop: () => { stopped = true } }
    async function* gen (): AsyncGenerator<AskStreamEvent> {
      yield { kind: 'status', message: 'only status' }
    }
    await streamAnswer(gen(), (md) => md, { write: () => true }, spinner)
    assert.ok(stopped)
  })

  it('strips a partial <!--REFERENCES prefix at end of stream', async () => {
    const output: string[] = []
    await streamAnswer(
      chunks('Answer\n\n<!--REFER'),
      (md) => md.trim(),
      { write: (s: string) => { output.push(s); return true } },
    )
    const joined = output.join('')
    assert.ok(joined.includes('Answer'))
    assert.ok(!joined.includes('<!--REFER'))
  })
})

describe('startSpinner', () => {
  it('writes a frame and the provided phase to the stream after a tick', async () => {
    const writes: string[] = []
    const handle = startSpinner({ write: (s: string) => { writes.push(s); return true } }, 'Working…')

    // wait longer than one interval (80ms) to trigger at least one frame write
    await new Promise((r) => setTimeout(r, 120))
    handle.stop()

    assert.ok(writes.length >= 1)
    assert.ok(writes.some((w) => w.includes('Working…')))
  })

  it('changes the phase label on setPhase()', async () => {
    const writes: string[] = []
    const handle = startSpinner({ write: (s: string) => { writes.push(s); return true } }, 'First')
    handle.setPhase('Second')

    await new Promise((r) => setTimeout(r, 120))
    handle.stop()

    assert.ok(writes.some((w) => w.includes('Second')))
  })

  it('stop() clears the spinner line', async () => {
    const writes: string[] = []
    const handle = startSpinner({ write: (s: string) => { writes.push(s); return true } })
    handle.stop()
    // stop emits a final \r + clear sequence
    assert.ok(writes.some((w) => w.includes('\r')))
  })
})
