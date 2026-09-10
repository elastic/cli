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
