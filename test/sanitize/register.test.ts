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
})
