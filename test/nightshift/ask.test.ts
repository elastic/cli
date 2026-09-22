/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createAskCommand } from '../../src/nightshift/ask.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
import type { NightshiftAnswer } from '../../src/nightshift/client.ts'

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const DEFAULT_ANSWER: NightshiftAnswer = {
  conversationId: VALID_UUID,
  message: 'Root cause: payments.',
}

function makeDeps (opts: { answer?: NightshiftAnswer; throws?: Error } = {}) {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []

  const converseImpl = opts.throws != null
    ? (_prompt: string, _convId?: string, _timeout?: number): Promise<NightshiftAnswer> => Promise.reject(opts.throws)
    : (_prompt: string, _convId?: string, _timeout?: number): Promise<NightshiftAnswer> =>
        Promise.resolve(opts.answer ?? DEFAULT_ANSWER)

  return {
    converse: converseImpl,
    stdout: { write: (s: string) => { stdoutLines.push(s); return true } },
    stderr: { write: (s: string) => { stderrLines.push(s); return true } },
    get stdoutText () { return stdoutLines.join('') },
    get stderrText () { return stderrLines.join('') },
  }
}

/** Runs a command, swallowing any throws from Commander exitOverride() so tests can inspect side effects. */
async function runCmd (
  deps: ReturnType<typeof makeDeps>,
  args: string[],
  captureErr?: { text: string[] },
): Promise<void> {
  const cmd = createAskCommand(deps)
  cmd.exitOverride()
  cmd.configureOutput({
    writeOut: () => {},
    writeErr: (s) => { captureErr?.text.push(s) },
  })
  const restoreStdin = _testSetStdinReader(() => '')
  try {
    await cmd.parseAsync(args, { from: 'user' })
  } catch {
    // exitOverride() causes Commander to throw CommanderError instead of process.exit();
    // swallow it so tests can assert on side-effects (exitCode, converse calls, etc.)
  } finally {
    restoreStdin()
  }
}

afterEach(() => { process.exitCode = 0 })

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

describe('createAskCommand — basics', () => {
  it('is named "ask"', () => {
    assert.equal(createAskCommand().name(), 'ask')
  })

  it('exposes a positional argument and --prompt / --conversation-id options', () => {
    const cmd = createAskCommand()
    assert.equal(cmd.registeredArguments.length, 1)
    const optLongs = cmd.options.map(o => o.long)
    assert.ok(optLongs.includes('--prompt'), `expected --prompt, got: ${optLongs.join(',')}`)
    assert.ok(optLongs.includes('--conversation-id'), `expected --conversation-id, got: ${optLongs.join(',')}`)
  })

  it('exposes --timeout option', () => {
    const cmd = createAskCommand()
    const optLongs = cmd.options.map(o => o.long)
    assert.ok(optLongs.includes('--timeout'), `expected --timeout, got: ${optLongs.join(',')}`)
  })

  it('exposes --verbose option', () => {
    const cmd = createAskCommand()
    const optLongs = cmd.options.map(o => o.long)
    assert.ok(optLongs.includes('--verbose'), `expected --verbose, got: ${optLongs.join(',')}`)
  })
})

// ---------------------------------------------------------------------------
// Text mode (default — only when stdout is a TTY)
// ---------------------------------------------------------------------------

describe('createAskCommand — text mode', () => {
  it('writes the answer to stdout', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'Root cause is X.' } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['why is checkout slow?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(deps.stdoutText.includes('Root cause is X.'), `stdout: ${deps.stdoutText}`)
  })

  it('writes the conversation id to stderr on the first turn (no input conversation_id)', async () => {
    const deps = makeDeps()
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['what happened?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(deps.stderrText.includes(`conversation: ${VALID_UUID}`), `stderr: ${deps.stderrText}`)
  })

  it('omits conversation id from stderr when caller already supplied it', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'nightshift-test-'))
    const file = join(dir, 'input.json')
    await writeFile(file, JSON.stringify({ prompt: 'follow-up', conversation_id: VALID_UUID }))
    const deps = makeDeps()
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['--input-file', file])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
      await rm(dir, { recursive: true })
    }
    assert.ok(!deps.stderrText.includes('conversation:'), `stderr should be silent when id was supplied: ${deps.stderrText}`)
  })

  it('does not write the conversation id to stdout', async () => {
    const deps = makeDeps()
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['what happened?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(!deps.stdoutText.includes('conversation:'), `stdout should not contain id: ${deps.stdoutText}`)
  })

  it('appends a trailing newline to the answer when missing', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'No newline' } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['something'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(deps.stdoutText.endsWith('\n'), `expected trailing newline, got: ${JSON.stringify(deps.stdoutText)}`)
  })

  it('does not double-add a newline when the message already ends with one', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'Already.\n' } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['something'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.equal(deps.stdoutText, 'Already.\n')
  })

  it('shows tool call count on stderr with --verbose when steps are present', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'Answer.', steps: 3 } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['--verbose', 'what?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(deps.stderrText.includes('3 tool calls'), `expected tool call count: ${deps.stderrText}`)
  })

  it('does not show tool call count without --verbose', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'Answer.', steps: 3 } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['what?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.ok(!deps.stderrText.includes('tool calls'), `unexpected tool call count: ${deps.stderrText}`)
  })
})

// ---------------------------------------------------------------------------
// Non-TTY stdout — auto-JSON
// ---------------------------------------------------------------------------

describe('createAskCommand — non-TTY stdout auto-JSON', () => {
  it('emits JSON when stdout is not a TTY (piped)', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'The answer.' } })
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true })
    try {
      await runCmd(deps, ['what happened?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    // Non-TTY auto-JSON writes via deps.stdout.write (not process.stdout.write)
    const parsed = JSON.parse(deps.stdoutText) as unknown
    assert.ok(typeof (parsed as Record<string, unknown>)['conversation_id'] === 'string', 'expected conversation_id')
    assert.ok(typeof (parsed as Record<string, unknown>)['message'] === 'string', 'expected message field')
  })


})

// ---------------------------------------------------------------------------
// JSON mode (explicit --json)
// ---------------------------------------------------------------------------

describe('createAskCommand — JSON mode', () => {
  it('emits { conversation_id, message } as JSON under --json', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'The answer.' } })
    const captured: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((s: unknown) => { if (typeof s === 'string') captured.push(s); return true }) as typeof process.stdout.write
    try {
      const cmd = createAskCommand(deps)
      cmd.exitOverride()
      // Inject --json as a local option (global flag lives on root program in real usage)
      cmd.option('--json', 'output as JSON')
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--json', 'what happened?'], { from: 'user' })
      } finally { restoreStdin() }

      const parsed = JSON.parse(captured.join('')) as unknown
      assert.deepEqual(parsed, { conversation_id: VALID_UUID, message: 'The answer.' })
    } finally {
      process.stdout.write = origWrite
    }
  })

  it('includes tool_calls in JSON when steps are present', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'The answer.', steps: 5 } })
    const captured: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((s: unknown) => { if (typeof s === 'string') captured.push(s); return true }) as typeof process.stdout.write
    try {
      const cmd = createAskCommand(deps)
      cmd.exitOverride()
      cmd.option('--json', 'output as JSON')
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--json', 'what happened?'], { from: 'user' })
      } finally { restoreStdin() }

      const parsed = JSON.parse(captured.join('')) as Record<string, unknown>
      assert.equal(parsed['tool_calls'], 5)
    } finally {
      process.stdout.write = origWrite
    }
  })

  it('omits tool_calls from JSON when steps are absent', async () => {
    const deps = makeDeps({ answer: { conversationId: VALID_UUID, message: 'The answer.' } })
    const captured: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((s: unknown) => { if (typeof s === 'string') captured.push(s); return true }) as typeof process.stdout.write
    try {
      const cmd = createAskCommand(deps)
      cmd.exitOverride()
      cmd.option('--json', 'output as JSON')
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--json', 'what happened?'], { from: 'user' })
      } finally { restoreStdin() }

      const parsed = JSON.parse(captured.join('')) as Record<string, unknown>
      assert.ok(!('tool_calls' in parsed), 'tool_calls should be absent when steps not in response')
    } finally {
      process.stdout.write = origWrite
    }
  })


})

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('createAskCommand — timeout', () => {
  it('passes timeoutSeconds to converse when --timeout is given', async () => {
    let receivedTimeout: number | undefined
    const deps = makeDeps()
    deps.converse = (_p: string, _id?: string, timeout?: number) => {
      receivedTimeout = timeout
      return Promise.resolve(DEFAULT_ANSWER)
    }
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['--timeout', '30', 'what?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.equal(receivedTimeout, 30)
  })

  it('passes undefined timeout to converse when --timeout is not given', async () => {
    let receivedTimeout: number | undefined = 999
    const deps = makeDeps()
    deps.converse = (_p: string, _id?: string, timeout?: number) => {
      receivedTimeout = timeout
      return Promise.resolve(DEFAULT_ANSWER)
    }
    const origIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      await runCmd(deps, ['what?'])
    } finally {
      if (origIsTTY) Object.defineProperty(process.stdout, 'isTTY', origIsTTY)
      else delete (process.stdout as { isTTY?: boolean }).isTTY
    }
    assert.equal(receivedTimeout, undefined)
  })
})

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('createAskCommand — input validation', () => {
  it('exits 1 and does not call converse when prompt is empty', async () => {
    const deps = makeDeps()
    let called = false
    deps.converse = () => { called = true; return Promise.resolve(DEFAULT_ANSWER) }
    await runCmd(deps, ['--prompt', '   '])
    assert.equal(called, false)
    assert.equal(process.exitCode, 1)
  })

  it('exits 1 and does not call converse when no prompt is given', async () => {
    const deps = makeDeps()
    let called = false
    deps.converse = () => { called = true; return Promise.resolve(DEFAULT_ANSWER) }
    await runCmd(deps, [])
    assert.equal(called, false)
    assert.equal(process.exitCode, 1)
  })

  it('does not call converse when an unknown input key is provided via --input-file', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'nightshift-test-'))
    const file = join(dir, 'input.json')
    await writeFile(file, JSON.stringify({ prompt: 'hi', unknown_field: 'bad' }))
    const deps = makeDeps()
    let called = false
    deps.converse = () => { called = true; return Promise.resolve(DEFAULT_ANSWER) }
    try {
      await runCmd(deps, ['--input-file', file])
      assert.equal(called, false)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('does not call converse when conversation_id is not a valid UUID', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'nightshift-test-'))
    const file = join(dir, 'input.json')
    await writeFile(file, JSON.stringify({ prompt: 'hi', conversation_id: 'not-a-uuid' }))
    const deps = makeDeps()
    let called = false
    deps.converse = () => { called = true; return Promise.resolve(DEFAULT_ANSWER) }
    try {
      await runCmd(deps, ['--input-file', file])
      assert.equal(called, false)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('forwards a valid conversation_id to converse', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'nightshift-test-'))
    const file = join(dir, 'input.json')
    await writeFile(file, JSON.stringify({ prompt: 'follow-up', conversation_id: VALID_UUID }))
    let received: string | undefined
    const deps = makeDeps()
    deps.converse = (_p: string, convId?: string) => { received = convId; return Promise.resolve(DEFAULT_ANSWER) }
    try {
      await runCmd(deps, ['--input-file', file])
      assert.equal(received, VALID_UUID)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('passes conversation_id as undefined when not supplied', async () => {
    let received: string | undefined = 'sentinel'
    const deps = makeDeps()
    deps.converse = (_p: string, convId?: string) => { received = convId; return Promise.resolve(DEFAULT_ANSWER) }
    await runCmd(deps, ['first question'])
    assert.equal(received, undefined)
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('createAskCommand — error handling', () => {
  it('exits 1 when converse throws a Kibana API error', async () => {
    const deps = makeDeps({ throws: new Error('Kibana API error 503: service unavailable') })
    const errText: string[] = []
    await runCmd(deps, ['what?'], { text: errText })
    assert.equal(process.exitCode, 1)
    const combined = errText.join('')
    assert.ok(combined.includes('kibana_api_error') || combined.includes('503'), `error output: ${combined}`)
  })

  it('exits 1 when Kibana is not configured (missing_config)', async () => {
    const deps = makeDeps({ throws: new Error('missing_config: No Kibana connection configured') })
    const errText: string[] = []
    await runCmd(deps, ['what?'], { text: errText })
    assert.equal(process.exitCode, 1)
    const combined = errText.join('')
    assert.ok(combined.includes('missing_config'), `error output: ${combined}`)
  })
})
