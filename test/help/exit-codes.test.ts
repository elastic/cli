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
  configLoadErrorCode,
  formatExitCodesHelp,
  formatTopicsHelp,
} from '../../src/help/catalog.ts'
import { registerHelpCommand } from '../../src/help/register.ts'
import { captureDuring } from '../helpers/capture.ts'

async function captured (fn: () => void | Promise<void>): Promise<{ stdout: string, stderr: string, exitCode: number | undefined }> {
  const origExit = process.exitCode
  process.exitCode = undefined
  const { stdout, stderr } = await captureDuring(fn)
  const exitCode = process.exitCode
  process.exitCode = origExit
  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode }
}

async function invokeHelp (args: string[]): Promise<{ stdout: string, stderr: string, exitCode: number | undefined }> {
  const prog = new Command('elastic')
  prog.exitOverride()
  prog.option('--json', 'output as JSON')
  prog.addCommand(registerHelpCommand())
  return captured(() => prog.parseAsync(args, { from: 'user' }))
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

describe('configLoadErrorCode', () => {
  it('keeps command_blocked and otherwise classifies the message', () => {
    assert.equal(configLoadErrorCode({ code: 'command_blocked', message: 'context "agent" does not allow --use-context' }), 'command_blocked')
    assert.equal(configLoadErrorCode({ message: 'No configuration file found.' }), 'missing_config')
    assert.equal(configLoadErrorCode({ code: 'config_unresolved', message: 'Failed to resolve config expressions' }), 'config_invalid')
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

  it('prints the topic in text', async () => {
    const out = await invokeHelp(['help', 'exit-codes'])
    assert.ok(out.exitCode === undefined || out.exitCode === 0)
    assert.ok(out.stdout.includes('missing_config'))
    assert.ok(out.stdout.includes('auth_required'))
    assert.ok(out.stdout.includes('elastic status --json'))
  })

  it('prints the topic as JSON', async () => {
    const out = await invokeHelp(['help', 'exit-codes', '--json'])
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

  it('lists topics when no topic is given', async () => {
    const out = await invokeHelp(['help'])
    assert.ok(out.stdout.includes('exit-codes'))
  })

  it('lists topics as JSON when no topic is given', async () => {
    const out = await invokeHelp(['--json', 'help'])
    const parsed = JSON.parse(out.stdout) as { topics: Array<{ name: string }> }
    assert.ok(parsed.topics.some(t => t.name === 'exit-codes'))
  })

  it('unknown topic uses input_validation_failed', async () => {
    const out = await invokeHelp(['help', 'not-a-topic', '--json'])
    const parsed = JSON.parse(out.stderr) as { error: { code: string } }
    assert.equal(parsed.error.code, 'input_validation_failed')
    assert.equal(out.exitCode, 1)
  })
})
