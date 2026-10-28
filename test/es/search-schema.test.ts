/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEsApisInFile } from '../../src/es/apis.ts'
import { registerEsCommands } from '../../src/es/register.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
import type { OpaqueCommandHandle } from '../../src/factory.ts'

/**
 * Regression coverage for the real `stack es search` command's input schema:
 * validation must accept the same request bodies regardless of whether they
 * arrive via stdin, --input-file, or CLI flags (#156-style relaxation must
 * not be gated on the CLI-flag code path).
 */
async function searchCommand (): Promise<OpaqueCommandHandle> {
  const defs = await loadEsApisInFile('search')
  const def = defs.find((d) => d.name === 'search' && d.namespace == null)
  assert.ok(def != null, 'expected a root-level "search" definition')
  const handle = await registerEsCommands([def])
  const cmd = handle.commands.find((c) => c.name() === 'search')
  assert.ok(cmd != null, 'expected a "search" leaf command')
  return cmd
}

/** mounts a command under a root program with --json and captures stdout */
async function captureStdout (handle: OpaqueCommandHandle, argv: string[]): Promise<string> {
  const { Command } = await import('commander')
  const prog = new Command('elastic')
  prog.option('--json', 'output as JSON')
  prog.addCommand(handle)
  prog.exitOverride()
  handle.exitOverride()
  let out = ''
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => { if (typeof chunk === 'string') out += chunk; return true }
  try {
    await prog.parseAsync(['--json', handle.name(), ...argv], { from: 'user' })
  } finally {
    process.stdout.write = orig
  }
  return out
}

describe('stack es search -- input validation parity across sources (#relaxFields)', () => {
  let origIsTTY: boolean | undefined
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('accepts a nested query body via stdin (dry-run --json)', async () => {
    const restore = _testSetStdinReader(() => JSON.stringify({ index: 'i', query: { match: { title: 'x' } } }))
    try {
      const cmd = await searchCommand()
      const out = await captureStdout(cmd, ['--dry-run'])
      assert.deepEqual(JSON.parse(out), { success: true })
    } finally {
      restore()
    }
  })

  it('accepts a nested query body via --input-file (dry-run --json)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elastic-cli-search-schema-'))
    const filePath = join(dir, 'body.json')
    writeFileSync(filePath, JSON.stringify({ index: 'i', query: { match: { title: 'x' } } }))
    try {
      const cmd = await searchCommand()
      const out = await captureStdout(cmd, ['--input-file', filePath, '--dry-run'])
      assert.deepEqual(JSON.parse(out), { success: true })
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  describe('_source forms', () => {
    for (const [label, source] of [
      ['boolean true', true],
      ['field-name string', 'title'],
      ['array of field names', ['title', 'author']],
      ['includes/excludes object', { includes: ['title'], excludes: ['body'] }],
    ] as const) {
      it(`accepts _source as ${label} via stdin`, async () => {
        const restore = _testSetStdinReader(() => JSON.stringify({ index: 'i', _source: source }))
        try {
          const cmd = await searchCommand()
          const out = await captureStdout(cmd, ['--dry-run'])
          assert.deepEqual(JSON.parse(out), { success: true })
        } finally {
          restore()
        }
      })
    }
  })
})

/** mounts a command under a root program with --json and captures stderr from a failing run */
async function captureJsonError (handle: OpaqueCommandHandle, argv: string[]): Promise<{ code: string, issues: Array<{ code: string, message: string }> }> {
  const { Command } = await import('commander')
  const prog = new Command('elastic')
  prog.option('--json', 'output as JSON')
  prog.addCommand(handle)
  prog.exitOverride()
  handle.exitOverride()
  let err = ''
  const orig = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk: unknown) => { if (typeof chunk === 'string') err += chunk; return true }
  try {
    await prog.parseAsync(['--json', handle.name(), ...argv], { from: 'user' })
  } catch {
    // emitError throws after writing the JSON error to stderr
  } finally {
    process.stderr.write = orig
  }
  return (JSON.parse(err) as { error: { code: string, issues: Array<{ code: string, message: string }> } }).error
}

describe('stack es search -- unknown top-level body keys are rejected (#801)', () => {
  let origIsTTY: boolean | undefined
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  for (const key of ['aggs', 'qeury']) {
    it(`rejects top-level "${key}" with input_validation_failed naming the key`, async () => {
      const restore = _testSetStdinReader(() => JSON.stringify({ index: 'i', size: 0, [key]: { x: {} } }))
      try {
        const cmd = await searchCommand()
        const error = await captureJsonError(cmd, ['--dry-run'])
        assert.equal(error.code, 'input_validation_failed')
        assert.ok(
          error.issues.some((i) => i.code === 'additionalProperties' && i.message.includes(`'${key}'`)),
          `expected an additionalProperties issue naming ${key}, got ${JSON.stringify(error.issues)}`
        )
      } finally {
        restore()
      }
    })
  }

  it('accepts top-level "aggregations" with nested "aggs" sub-aggregations', async () => {
    const body = {
      index: 'i',
      size: 0,
      aggregations: { by_day: { date_histogram: { field: '@timestamp', calendar_interval: 'day' }, aggs: { n: { value_count: { field: '_id' } } } } },
    }
    const restore = _testSetStdinReader(() => JSON.stringify(body))
    try {
      const cmd = await searchCommand()
      const out = await captureStdout(cmd, ['--dry-run'])
      assert.deepEqual(JSON.parse(out), { success: true })
    } finally {
      restore()
    }
  })
})
