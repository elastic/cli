/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import {
  ERROR_CODES,
  EXIT_CODES,
  classifyConfigLoadError,
  formatExitCodesHelp,
  formatTopicsHelp,
} from '../../src/help/catalog.ts'
import { registerHelpCommand } from '../../src/help/register.ts'

function captured (fn: () => void): { stdout: string, stderr: string, exitCode: number | undefined } {
  const stdout: string[] = []
  const stderr: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const origExit = process.exitCode
  process.stdout.write = ((chunk: unknown) => { if (typeof chunk === 'string') stdout.push(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => { if (typeof chunk === 'string') stderr.push(chunk); return true }) as typeof process.stderr.write
  process.exitCode = undefined
  try {
    fn()
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
  const exitCode = process.exitCode
  process.exitCode = origExit
  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode }
}

function invokeHelp (args: string[]): { stdout: string, stderr: string, exitCode: number | undefined } {
  const prog = new Command('elastic')
  prog.exitOverride()
  prog.option('--json', 'output as JSON')
  prog.addCommand(registerHelpCommand())
  return captured(() => {
    prog.parse(args, { from: 'user' })
  })
}

describe('classifyConfigLoadError', () => {
  it('maps missing file to missing_config', () => {
    assert.equal(classifyConfigLoadError('No configuration file found. Create a .elasticrc.yml'), 'missing_config')
    assert.equal(classifyConfigLoadError("ENOENT: no such file or directory, open '/tmp/x.yml'"), 'missing_config')
  })

  it('maps parse and validation failures to config_invalid', () => {
    assert.equal(classifyConfigLoadError('contexts.local: required'), 'config_invalid')
    assert.equal(classifyConfigLoadError('Unknown profile "nope"'), 'config_invalid')
  })
})

describe('elastic help exit-codes', () => {
  for (const row of EXIT_CODES) {
    it(`lists exit code ${row.code} ${row.name}`, () => {
      const text = formatExitCodesHelp()
      assert.ok(text.includes(String(row.code)), `expected ${row.code} in help`)
      assert.ok(text.includes(row.name), `expected ${row.name} in help`)
    })
  }

  for (const row of ERROR_CODES) {
    it(`lists error.code ${row.code}`, () => {
      assert.ok(formatExitCodesHelp().includes(row.code), `expected ${row.code} in help`)
    })
  }

  it('lists topics', () => {
    assert.ok(formatTopicsHelp().includes('exit-codes'))
  })

  it('prints the topic in text', () => {
    const out = invokeHelp(['help', 'exit-codes'])
    assert.equal(out.exitCode, undefined)
    assert.ok(out.stdout.includes('missing_config'))
    assert.ok(out.stdout.includes('auth_required'))
    assert.ok(out.stdout.includes('elastic status --json'))
  })

  it('prints the topic as JSON', () => {
    const out = invokeHelp(['help', 'exit-codes', '--json'])
    const parsed = JSON.parse(out.stdout) as {
      topic: string
      exit_codes: typeof EXIT_CODES
      error_codes: typeof ERROR_CODES
      probe: string
    }
    assert.equal(parsed.topic, 'exit-codes')
    assert.equal(parsed.probe, 'elastic status --json')
    assert.deepEqual(parsed.exit_codes.map(e => e.code), EXIT_CODES.map(e => e.code))
    assert.deepEqual(parsed.error_codes.map(e => e.code), ERROR_CODES.map(e => e.code))
  })

  it('lists topics when no topic is given', () => {
    const out = invokeHelp(['help'])
    assert.ok(out.stdout.includes('exit-codes'))
  })

  it('lists topics as JSON when no topic is given', () => {
    const out = invokeHelp(['--json', 'help'])
    const parsed = JSON.parse(out.stdout) as { topics: Array<{ name: string }> }
    assert.ok(parsed.topics.some(t => t.name === 'exit-codes'))
  })

  it('unknown topic uses input_validation_failed', () => {
    const out = invokeHelp(['help', 'not-a-topic', '--json'])
    const parsed = JSON.parse(out.stderr) as { error: { code: string } }
    assert.equal(parsed.error.code, 'input_validation_failed')
    assert.equal(out.exitCode, 1)
  })
})
