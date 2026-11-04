/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { buildKbPresetCommand } from '../../src/kb/register.ts'
import { buildKibanaRequestParams } from '../../src/kb/request-builder.ts'
import type { KibanaClient, KibanaRequestParams } from '../../src/lib/kibana-client.ts'
import type { OpaqueCommandHandle } from '../../src/factory.ts'

const CHAT_MESSAGE = 'agent-builder.post-chat-message'

function recordingDeps (sent: KibanaRequestParams[], response: unknown = { conversation_id: 'c1', answer: 'hi' }) {
  const client = { request: async (params: KibanaRequestParams) => { sent.push(params); return response } }
  return { buildKibanaRequestParams, getKibanaClient: () => client as unknown as KibanaClient }
}

function longFlags (cmd: OpaqueCommandHandle): string[] {
  return cmd.options.map((o) => o.long ?? '')
}

/** Runs the command and captures string writes to stdout/stderr. */
async function run (cmd: OpaqueCommandHandle, argv: string[]): Promise<{ stdout: string, stderr: string }> {
  let stdout = ''
  let stderr = ''
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const patch = (orig: typeof origOut, sink: (s: string) => void) => (chunk: unknown, ...rest: unknown[]): boolean => {
    if (typeof chunk === 'string') { sink(chunk); return true }
    return Reflect.apply(orig, process.stdout, [chunk, ...rest]) as boolean
  }
  process.stdout.write = patch(origOut, (s) => { stdout += s }) as typeof process.stdout.write
  process.stderr.write = patch(origErr, (s) => { stderr += s }) as typeof process.stderr.write
  const exitCode = process.exitCode
  cmd.exitOverride()
  try {
    await cmd.parseAsync(argv, { from: 'user' })
  } catch { /* CommanderError from exitOverride */ } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
    process.exitCode = exitCode
  }
  return { stdout, stderr }
}

describe('buildKbPresetCommand', () => {
  let tmpDir: string
  let origIsTTY: boolean | undefined
  before(() => { tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-preset-')) })
  after(() => { rmSync(tmpDir, { recursive: true }) })
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('exposes the generated flags under the new name, minus the fixed fields', async () => {
    const cmd = await buildKbPresetCommand({
      apiId: CHAT_MESSAGE,
      name: 'ask',
      description: 'Ask the agent',
      fixed: { agent_id: 'nightshift.assistant' },
    })
    assert.equal(cmd.name(), 'ask')
    assert.equal(cmd.description(), 'Ask the agent')
    const flags = longFlags(cmd)
    assert.ok(flags.includes('--message'))
    assert.ok(flags.includes('--conversation-id'))
    assert.ok(flags.includes('--dry-run'))
    assert.equal(flags.includes('--agent-id'), false)
  })

  it('sends the fixed values with the generated request', async () => {
    const sent: KibanaRequestParams[] = []
    const cmd = await buildKbPresetCommand({
      apiId: CHAT_MESSAGE,
      name: 'ask',
      description: 'Ask the agent',
      fixed: { agent_id: 'nightshift.assistant' },
    }, recordingDeps(sent))
    const { stdout } = await run(cmd, ['--message', 'why is checkout slow?', '--conversation-id', 'c1'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.method, 'POST')
    assert.equal(sent[0]!.path, '/api/chat/message')
    assert.deepEqual(sent[0]!.body, {
      message: 'why is checkout slow?',
      conversation_id: 'c1',
      agent_id: 'nightshift.assistant',
    })
    assert.match(stdout, /hi/)
  })

  it('accepts the positional field as a positional argument', async () => {
    const sent: KibanaRequestParams[] = []
    const cmd = await buildKbPresetCommand({
      apiId: CHAT_MESSAGE,
      name: 'ask',
      description: 'Ask the agent',
      fixed: { agent_id: 'nightshift.assistant' },
      positional: 'message',
    }, recordingDeps(sent))
    await run(cmd, ['why is checkout slow?'])
    assert.equal(sent.length, 1)
    assert.deepEqual(sent[0]!.body, { message: 'why is checkout slow?', agent_id: 'nightshift.assistant' })
  })

  it('throws when the positional field is not part of the generated input schema', async () => {
    await assert.rejects(
      buildKbPresetCommand({ apiId: CHAT_MESSAGE, name: 'ask', description: 'x', fixed: {}, positional: 'msg' }),
      /msg/
    )
  })

  it('rejects a fixed field supplied via JSON input instead of overriding it silently', async () => {
    const filePath = join(tmpDir, 'override.json')
    writeFileSync(filePath, JSON.stringify({ message: 'hi', agent_id: 'elastic-ai-agent' }))
    const sent: KibanaRequestParams[] = []
    const cmd = await buildKbPresetCommand({
      apiId: CHAT_MESSAGE,
      name: 'ask',
      description: 'Ask the agent',
      fixed: { agent_id: 'nightshift.assistant' },
    }, recordingDeps(sent))
    const { stderr } = await run(cmd, ['--input-file', filePath])
    assert.equal(sent.length, 0)
    assert.match(stderr, /agent_id/)
  })

  it('throws for an unknown API id', async () => {
    await assert.rejects(
      buildKbPresetCommand({ apiId: 'agent-builder.does-not-exist', name: 'ask', description: 'x', fixed: {} }),
      /agent-builder\.does-not-exist/
    )
  })

  describe('experimental', () => {
    const base = { apiId: CHAT_MESSAGE, name: 'ask', description: 'Ask the agent', fixed: { agent_id: 'nightshift.assistant' } }
    const BANNER = /Warning: "nightshift ask" is experimental and subject to significant changes before it reaches a stable state\.[\s\S]*--accept-experimental/

    async function build (sent: KibanaRequestParams[]) {
      const cmd = await buildKbPresetCommand({ ...base, experimental: { label: 'nightshift ask' } }, recordingDeps(sent))
      assert.ok(cmd != null)
      return cmd
    }

    it('warns on stderr and still sends the request', async () => {
      const sent: KibanaRequestParams[] = []
      const { stdout, stderr } = await run(await build(sent), ['--message', 'hi'])
      assert.match(stderr, BANNER)
      assert.doesNotMatch(stdout, /experimental/)
      assert.equal(sent.length, 1)
      assert.deepEqual(sent[0]!.body, { message: 'hi', agent_id: 'nightshift.assistant' })
    })

    it('colors the warning only when stderr is a TTY', async () => {
      const origIsTTY = process.stderr.isTTY
      const setTTY = (value: boolean | undefined) => Object.defineProperty(process.stderr, 'isTTY', { value, configurable: true, writable: true })
      try {
        setTTY(true)
        const tty = await run(await build([]), ['--message', 'hi'])
        assert.ok(tty.stderr.startsWith('\x1b[33mWarning: "nightshift ask" is experimental'), 'Expected ANSI yellow color code')
        assert.ok(tty.stderr.includes('\x1b[0m'), 'Expected ANSI reset code')
        setTTY(false)
        const plain = await run(await build([]), ['--message', 'hi'])
        assert.match(plain.stderr, BANNER)
        assert.ok(!plain.stderr.includes('\x1b['), 'Expected no ANSI codes')
      } finally {
        setTTY(origIsTTY)
      }
    })

    it('--accept-experimental suppresses the warning and is not sent to Kibana', async () => {
      const sent: KibanaRequestParams[] = []
      const { stderr } = await run(await build(sent), ['--message', 'hi', '--accept-experimental'])
      assert.doesNotMatch(stderr, /experimental/)
      assert.deepEqual(sent[0]!.body, { message: 'hi', agent_id: 'nightshift.assistant' })
    })

    it('--json suppresses the warning', async () => {
      const sent: KibanaRequestParams[] = []
      const root = new Command('elastic').option('--json', 'output as JSON').addCommand(await build(sent))
      const { stderr } = await run(root, ['--json', 'ask', '--message', 'hi'])
      assert.doesNotMatch(stderr, /experimental/)
      assert.equal(sent.length, 1)
    })

    it('does not warn when validation fails before the request', async () => {
      const sent: KibanaRequestParams[] = []
      const { stderr } = await run(await build(sent), [])
      assert.doesNotMatch(stderr, /is experimental/)
      assert.equal(sent.length, 0)
    })

    it('non-experimental presets have no flag and no warning', async () => {
      const cmd = await buildKbPresetCommand(base, recordingDeps([]))
      assert.ok(cmd != null)
      assert.equal(longFlags(cmd).includes('--accept-experimental'), false)
      const { stderr } = await run(cmd, ['--message', 'hi'])
      assert.doesNotMatch(stderr, /experimental/)
    })
  })

  describe('availability', () => {
    const base = { apiId: CHAT_MESSAGE, name: 'ask', description: 'Ask the agent', fixed: {} }

    it('returns null when the target stack version predates the endpoint', async () => {
      assert.equal(await buildKbPresetCommand({ ...base, target: [9, 5] }), null)
    })

    it('builds the command when the target stack version has the endpoint', async () => {
      assert.ok(await buildKbPresetCommand({ ...base, target: [9, 6] }) != null)
    })

    it('builds the command without a target', async () => {
      assert.ok(await buildKbPresetCommand(base) != null)
    })

    it('with flavors: [serverless], returns null for any stack target', async () => {
      assert.equal(await buildKbPresetCommand({ ...base, flavors: ['serverless'], target: [9, 6] }), null)
      assert.equal(await buildKbPresetCommand({ ...base, flavors: ['serverless'], target: [10, 0] }), null)
    })

    it('with flavors: [serverless], builds the command for a serverless target or no target', async () => {
      assert.ok(await buildKbPresetCommand({ ...base, flavors: ['serverless'], target: 'serverless' }) != null)
      assert.ok(await buildKbPresetCommand({ ...base, flavors: ['serverless'] }) != null)
    })

    it('throws when a flavor is not in the endpoint availability', async () => {
      await assert.rejects(
        buildKbPresetCommand({ ...base, flavors: ['serverless', 'cloud' as 'serverless'] }),
        /cloud/
      )
    })
  })

  it('throws when a fixed field is not part of the generated input schema', async () => {
    await assert.rejects(
      buildKbPresetCommand({ apiId: CHAT_MESSAGE, name: 'ask', description: 'x', fixed: { agentid: 'typo' } }),
      /agentid/
    )
  })
})
