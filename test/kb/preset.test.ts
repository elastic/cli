/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
      fixed: { agent_id: 'nightshift.investigation' },
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
      fixed: { agent_id: 'nightshift.investigation' },
    }, recordingDeps(sent))
    const { stdout } = await run(cmd, ['--message', 'why is checkout slow?', '--conversation-id', 'c1'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.method, 'POST')
    assert.equal(sent[0]!.path, '/api/chat/message')
    assert.deepEqual(sent[0]!.body, {
      message: 'why is checkout slow?',
      conversation_id: 'c1',
      agent_id: 'nightshift.investigation',
    })
    assert.match(stdout, /hi/)
  })

  it('rejects a fixed field supplied via JSON input instead of overriding it silently', async () => {
    const filePath = join(tmpDir, 'override.json')
    writeFileSync(filePath, JSON.stringify({ message: 'hi', agent_id: 'elastic-ai-agent' }))
    const sent: KibanaRequestParams[] = []
    const cmd = await buildKbPresetCommand({
      apiId: CHAT_MESSAGE,
      name: 'ask',
      description: 'Ask the agent',
      fixed: { agent_id: 'nightshift.investigation' },
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

  it('throws when a fixed field is not part of the generated input schema', async () => {
    await assert.rejects(
      buildKbPresetCommand({ apiId: CHAT_MESSAGE, name: 'ask', description: 'x', fixed: { agentid: 'typo' } }),
      /agentid/
    )
  })
})
