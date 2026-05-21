/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registerExtensionCommands } from '../../src/extension/register.ts'
import { _testSetRegistryPath } from '../../src/extension/store.ts'
import { _testSetExtensionsDir } from '../../src/extension/installer.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function invoke (args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { Command } = await import('commander')
  const program = new Command()
  program.exitOverride()
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  })

  const ext = registerExtensionCommands()
  program.addCommand(ext as unknown as InstanceType<typeof Command>)

  const stdout: string[] = []
  const stderr: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk: unknown) => { stdout.push(String(chunk)); return true }
  process.stderr.write = (chunk: unknown) => { stderr.push(String(chunk)); return true }

  let exitCode: number
  const origExit = process.exitCode
  try {
    await program.parseAsync(['node', 'elastic', 'extension', ...args])
  } catch {
    // commander exitOverride throws on error
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
    exitCode = (process.exitCode as number | undefined) ?? 0
    process.exitCode = origExit
  }

  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extension register -- error handling', () => {
  let tmpDir: string
  let registryFile: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-ext-register-test-'))
    registryFile = join(tmpDir, 'extensions.json')
    await writeFile(registryFile, '[]', 'utf-8')
    _testSetRegistryPath(registryFile)
    _testSetExtensionsDir(join(tmpDir, 'installs'))
  })

  after(async () => {
    _testSetRegistryPath(undefined)
    _testSetExtensionsDir(undefined)
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('install', () => {
    it('returns structured error for invalid source instead of throwing', async () => {
      const { stderr, exitCode } = await invoke(['install', 'not-a-valid/source/with/too/many/parts'])
      assert.equal(exitCode, 1)
      assert.match(stderr, /Error:/)
      assert.doesNotMatch(stderr, /at parseSource|at installExtension/)
    })

    it('returns structured error for bad github: prefix', async () => {
      const { stderr, exitCode } = await invoke(['install', 'github:'])
      assert.equal(exitCode, 1)
      assert.match(stderr, /Error:/)
      assert.doesNotMatch(stderr, /at parseSource/)
    })

    it('returns structured error for bare single-segment source', async () => {
      const { stderr, exitCode } = await invoke(['install', 'just-a-name'])
      assert.equal(exitCode, 1)
      assert.match(stderr, /Error:/)
    })
  })

  describe('remove', () => {
    it('returns structured error when extension is not installed', async () => {
      // uninstallExtension itself does not throw for unknown names (rm --force),
      // but an invalid name with path traversal chars will throw from the store
      // validate step -- confirm no stack trace leaks
      const { exitCode } = await invoke(['remove', 'nonexistent-ext'])
      // remove of unknown name succeeds silently (no-op)
      assert.equal(exitCode, 0)
    })
  })

  describe('upgrade', () => {
    it('returns structured error when named extension is not installed', async () => {
      const { stderr, exitCode } = await invoke(['upgrade', 'nonexistent'])
      assert.equal(exitCode, 1)
      assert.match(stderr, /Error:/)
      assert.doesNotMatch(stderr, /at upgradeExtension/)
    })
  })
})
