/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Command } from 'commander'
import { registerConfigCommands } from '../../src/config/commands.ts'

/**
 * Runs a config sub-command in-process (text mode), capturing stdout and
 * stderr and restoring process.exitCode (error envelopes set it to 1).
 */
async function runCapture (args: string[]): Promise<{ stdout: string; stderr: string }> {
  const prog = new Command('elastic')
  const group = registerConfigCommands()
  prog.addCommand(group)
  prog.exitOverride()
  group.exitOverride()
  let stdout = ''
  let stderr = ''
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const origExitCode = process.exitCode
  // The factory writes plain strings; the test runner flushes Buffer chunks
  // to stdout between awaits. Capture only strings and pass Buffers through
  // so the runner's reporting protocol is not corrupted.
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === 'string') { stdout += chunk; return true }
    return origOut(chunk as Uint8Array, ...(rest as []))
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === 'string') { stderr += chunk; return true }
    return origErr(chunk as Uint8Array, ...(rest as []))
  }) as typeof process.stderr.write
  try {
    await prog.parseAsync(['config', ...args], { from: 'user' })
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
    process.exitCode = origExitCode
  }
  return { stdout, stderr }
}

async function runText (args: string[]): Promise<string> {
  return (await runCapture(args)).stdout
}

describe('config commands text output', () => {
  let dir: string
  let cfg: string

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'elastic-cli-text-'))
    cfg = join(dir, 'cfg.yml')
  })
  after(async () => rm(dir, { recursive: true, force: true }))

  it('context add prints a confirmation sentence', async () => {
    const out = await runText([
      'context', 'add', 'local',
      '--config-file', cfg,
      '--es-url', 'http://localhost:9200',
      '--es-api-key', 'k1',
      '--inline-secrets',
    ])
    assert.match(out, /^Context 'local' added\.\n/)
  })

  it('context list marks the current context with an asterisk', async () => {
    await runText([
      'context', 'add', 'staging',
      '--config-file', cfg,
      '--es-url', 'https://staging:9200',
      '--es-api-key', 'k2',
      '--inline-secrets',
    ])
    const out = await runText(['context', 'list', '--config-file', cfg])
    assert.equal(out, '* local\n  staging\n')
  })

  it('current-context set prints a switch confirmation', async () => {
    const out = await runText(['current-context', 'set', 'staging', '--config-file', cfg])
    assert.match(out, /^Switched to context 'staging'\.\n/)
  })

  it('current-context get prints just the name', async () => {
    const out = await runText(['current-context', 'get', '--config-file', cfg])
    assert.equal(out, 'staging\n')
  })

  it('context edit prints an update confirmation', async () => {
    const out = await runText([
      'context', 'edit', 'local',
      '--config-file', cfg,
      '--es-url', 'http://new:9200',
      '--inline-secrets',
    ])
    assert.match(out, /^Context 'local' updated\.\n/)
  })

  it('context remove prints a removal confirmation', async () => {
    const out = await runText(['context', 'remove', 'local', '--config-file', cfg])
    assert.match(out, /^Context 'local' removed\.\n/)
  })

  it('context add of an existing name without --force errors', async () => {
    const { stderr } = await runCapture([
      'context', 'add', 'staging',
      '--config-file', cfg,
      '--es-url', 'http://x:9200',
      '--es-api-key', 'k',
      '--inline-secrets',
    ])
    assert.match(stderr, /already exists/)
  })

  it('context add with no fields errors', async () => {
    const { stderr } = await runCapture(['context', 'add', 'bare', '--config-file', cfg])
    assert.match(stderr, /No context fields provided/)
  })

  it('context edit of an unknown context errors', async () => {
    const { stderr } = await runCapture([
      'context', 'edit', 'missing',
      '--config-file', cfg,
      '--es-url', 'http://y:9200',
    ])
    assert.match(stderr, /not found/)
  })

  it('current-context set of an unknown context errors', async () => {
    const { stderr } = await runCapture(['current-context', 'set', 'nope', '--config-file', cfg])
    assert.match(stderr, /not found/)
  })

  it('context remove of the current context without --force errors', async () => {
    const { stderr } = await runCapture(['context', 'remove', 'staging', '--config-file', cfg])
    assert.match(stderr, /current context/)
  })

  it('context remove of an unknown context errors', async () => {
    const { stderr } = await runCapture(['context', 'remove', 'ghost', '--config-file', cfg])
    assert.match(stderr, /not found/)
  })

  it('context add --force overwrites an existing context', async () => {
    const out = await runText([
      'context', 'add', 'staging',
      '--config-file', cfg,
      '--es-url', 'http://forced:9200',
      '--es-username', 'user',
      '--es-password', 'pw',
      '--inline-secrets',
      '--force',
    ])
    assert.match(out, /^Context 'staging' added\.\n/)
  })

  it('context remove of the last context deletes the config file', async () => {
    const out = await runText(['context', 'remove', 'staging', '--config-file', cfg, '--force'])
    assert.match(out, /removed/)
    const listOut = await runText(['context', 'list', '--config-file', cfg])
    assert.equal(listOut, 'No contexts configured.\n')
  })
})
