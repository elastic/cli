/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerSanitizeCommands } from '../../src/sanitize/register.ts'

describe('registerSanitizeCommands', () => {
  it('creates a group named "sanitize"', () => {
    const group = registerSanitizeCommands()
    assert.equal(group.name(), 'sanitize')
  })

  it('has subcommands for all supported value types', () => {
    const group = registerSanitizeCommands()
    const subNames = group.commands.map((c: { name: () => string }) => c.name()).sort()
    assert.deepEqual(subNames, [
      'data-stream-dataset',
      'data-stream-namespace',
      'data-stream-type',
      'field-name',
      'index-name',
      'pipeline-name',
      'repository-name',
      'snapshot-name',
    ])
  })

  it('each subcommand has a positional value argument', () => {
    const group = registerSanitizeCommands()
    for (const cmd of group.commands as Array<{ name: () => string; registeredArguments: Array<{ name: () => string }> }>) {
      const args = cmd.registeredArguments
      assert.equal(args.length, 1, `${cmd.name()} should have one positional arg`)
      assert.equal(args[0].name(), 'value')
    }
  })

  it('index-name handler returns sanitized result', async () => {
    const group = registerSanitizeCommands()
    const indexCmd = (group.commands as Array<{ name: () => string }>).find(c => c.name() === 'index-name')!
    assert.ok(indexCmd);

    // Use parseAsync to invoke the handler through Commander
    (indexCmd as import('commander').Command).exitOverride()
    const written: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string) => { written.push(chunk); return true }) as typeof process.stdout.write
    try {
      await (indexCmd as import('commander').Command).parseAsync(['My\\Bad*Index'], { from: 'user' })
    } finally {
      process.stdout.write = origWrite
    }

    const output = written.join('')
    assert.ok(output.includes('mybadindex'), `expected sanitized value in output, got: ${output}`)
  })

  it('plain-text mode writes changes to stderr when input was modified', async () => {
    const group = registerSanitizeCommands()
    const indexCmd = (group.commands as Array<{ name: () => string }>).find(c => c.name() === 'index-name')!;

    (indexCmd as import('commander').Command).exitOverride()
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const origStdout = process.stdout.write.bind(process.stdout)
    const origStderr = process.stderr.write.bind(process.stderr)
    process.stdout.write = ((chunk: string) => { stdoutChunks.push(chunk); return true }) as typeof process.stdout.write
    process.stderr.write = ((chunk: string) => { stderrChunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      await (indexCmd as import('commander').Command).parseAsync(['My*Index'], { from: 'user' })
    } finally {
      process.stdout.write = origStdout
      process.stderr.write = origStderr
    }

    const stdout = stdoutChunks.join('')
    const stderr = stderrChunks.join('')
    assert.ok(stdout.includes('myindex'), `stdout should have sanitized value, got: ${stdout}`)
    assert.ok(stderr.includes('lowercased'), `stderr should list changes, got: ${stderr}`)
    assert.ok(stderr.includes('stripped forbidden characters'), `stderr should list changes, got: ${stderr}`)
  })

  it('returns error result when value is empty after sanitization', async () => {
    const group = registerSanitizeCommands()
    const indexCmd = (group.commands as Array<{ name: () => string }>).find(c => c.name() === 'index-name')!;

    (indexCmd as import('commander').Command).exitOverride()
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const origStdout = process.stdout.write.bind(process.stdout)
    const origStderr = process.stderr.write.bind(process.stderr)
    const origExitCode = process.exitCode
    process.stdout.write = ((chunk: string) => { stdoutChunks.push(chunk); return true }) as typeof process.stdout.write
    process.stderr.write = ((chunk: string) => { stderrChunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      await (indexCmd as import('commander').Command).parseAsync(['***'], { from: 'user' })
    } finally {
      process.stdout.write = origStdout
      process.stderr.write = origStderr
      process.exitCode = origExitCode
    }

    const stderr = stderrChunks.join('')
    assert.equal(stdoutChunks.join(''), '', 'stdout should be empty')
    assert.ok(stderr.includes('sanitize_empty') || stderr.includes('empty after sanitization'), `stderr should report empty result, got: ${stderr}`)
  })

  it('plain-text mode does not write to stderr when input is unchanged', async () => {
    const group = registerSanitizeCommands()
    const indexCmd = (group.commands as Array<{ name: () => string }>).find(c => c.name() === 'index-name')!;

    (indexCmd as import('commander').Command).exitOverride()
    const stderrChunks: string[] = []
    const origStdout = process.stdout.write.bind(process.stdout)
    const origStderr = process.stderr.write.bind(process.stderr)
    process.stdout.write = (() => true) as typeof process.stdout.write
    process.stderr.write = ((chunk: string) => { stderrChunks.push(chunk); return true }) as typeof process.stderr.write
    try {
      await (indexCmd as import('commander').Command).parseAsync(['validname'], { from: 'user' })
    } finally {
      process.stdout.write = origStdout
      process.stderr.write = origStderr
    }

    const stderr = stderrChunks.join('')
    assert.equal(stderr, '', `stderr should be empty when no changes, got: ${stderr}`)
  })
})
