/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import { buildCompletionCommand, SUPPORTED_SHELLS } from '../../src/completion/command.ts'

async function captureWith (
  cmd: Command,
  argv: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  cmd.exitOverride()
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const origStdout = process.stdout.write.bind(process.stdout)
  const origStderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((c: string) => { stdoutChunks.push(String(c)); return true }) as typeof process.stdout.write
  process.stderr.write = ((c: string) => { stderrChunks.push(String(c)); return true }) as typeof process.stderr.write
  // Reset the global exit code so we can read what this command sets.
  const priorExitCode = process.exitCode
  process.exitCode = undefined
  let throwExit: number | undefined
  try {
    await cmd.parseAsync(argv, { from: 'user' })
  } catch (e) {
    // Commander's exitOverride throws a CommanderError with .exitCode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throwExit = (e as any).exitCode ?? 1
  } finally {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
  }
  // Handlers in this codebase set process.exitCode (no throw) for structured
  // errors; capture either signal.
  const exitCode = throwExit ?? (process.exitCode != null ? Number(process.exitCode) : undefined)
  process.exitCode = priorExitCode
  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join(''), exitCode }
}

describe('buildCompletionCommand', () => {
  it('is named "completion"', () => {
    assert.equal(buildCompletionCommand().name(), 'completion')
  })

  it('declares a required positional <shell> argument', () => {
    const cmd = buildCompletionCommand()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (cmd as unknown as any).registeredArguments as Array<{ name: () => string; required: boolean }>
    assert.equal(args.length, 1)
    assert.equal(args[0].name(), 'shell')
    assert.equal(args[0].required, true)
  })

  it('emits the bash wrapper to stdout for "bash"', async () => {
    const { stdout, stderr } = await captureWith(buildCompletionCommand(), ['bash'])
    assert.match(stdout, /complete -F .* elastic/)
    assert.equal(stderr, '')
  })

  it('emits the zsh wrapper to stdout for "zsh"', async () => {
    const { stdout } = await captureWith(buildCompletionCommand(), ['zsh'])
    assert.match(stdout, /^#compdef elastic/)
  })

  it('emits the fish wrapper to stdout for "fish"', async () => {
    const { stdout } = await captureWith(buildCompletionCommand(), ['fish'])
    assert.match(stdout, /complete -c elastic/)
  })

  it('reports an error for an unknown shell', async () => {
    const { stderr, exitCode } = await captureWith(buildCompletionCommand(), ['tcsh'])
    assert.match(stderr, /unknown shell/i)
    assert.equal(exitCode, 1)
  })

  it('reports an error when no shell is provided', async () => {
    const { stderr, exitCode } = await captureWith(buildCompletionCommand(), [])
    assert.match(stderr, /missing required argument/i)
    assert.equal(exitCode, 1)
  })

  it('SUPPORTED_SHELLS lists bash, zsh and fish', () => {
    assert.deepEqual([...SUPPORTED_SHELLS].sort(), ['bash', 'fish', 'zsh'])
  })
})
