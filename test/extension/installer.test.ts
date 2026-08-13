/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the installer module.
 *
 * installExtension() itself requires git/npm on the PATH and makes network
 * calls, so it is covered by functional tests rather than here. These tests
 * focus on the pure logic: source parsing (via error messages), name
 * derivation, and the uninstallExtension() path.
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, readFile, stat, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalExtension, installExtension, uninstallExtension, upgradeExtension, upgradeAllExtensions, _testSetExtensionsDir, _testSetRun } from '../../src/extension/installer.ts'
import { readExtensions, writeExtensions, _testSetRegistryPath } from '../../src/extension/store.ts'
import type { InstalledExtension } from '../../src/extension/store.ts'

describe('installer', () => {
  let tmpDir: string
  let extDir: string
  let registryFile: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-installer-'))
    extDir = join(tmpDir, 'extensions')
    registryFile = join(tmpDir, 'extensions.json')
    _testSetExtensionsDir(extDir)
    _testSetRegistryPath(registryFile)
    await mkdir(extDir, { recursive: true })
  })

  after(async () => {
    _testSetExtensionsDir(undefined)
    _testSetRegistryPath(undefined)
    await rm(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await writeExtensions([])
    // clean up any installed dirs
    await rm(extDir, { recursive: true, force: true })
    await mkdir(extDir, { recursive: true })
  })

  describe('installExtension -- source validation', () => {
    it('rejects an empty npm source', async () => {
      await assert.rejects(installExtension('npm:'), /package name/)
    })

    it('rejects a github source with too many slashes', async () => {
      await assert.rejects(installExtension('github:owner/repo/extra'), /Invalid GitHub source/)
    })

    it('rejects a github source with an empty owner', async () => {
      await assert.rejects(installExtension('github:/repo'), /Invalid GitHub source/)
    })

    it('rejects a bare source that is not owner/repo', async () => {
      await assert.rejects(installExtension('notaslug'), /Invalid GitHub source/)
    })

    it('rejects a source whose derived name contains invalid characters', async () => {
      await assert.rejects(installExtension('github:org/UPPERCASE_TOOL'), /invalid characters/)
    })
  })

  describe('uninstallExtension', () => {
    it('removes the install directory and registry entry', async () => {
      const entry: InstalledExtension = {
        name: 'local',
        source: 'github:elastic/elastic-local',
        path: join(extDir, 'elastic-local'),
        entrypoint: join(extDir, 'elastic-local', 'elastic-local'),
      }
      await mkdir(entry.path, { recursive: true })
      await writeFile(entry.entrypoint, '#!/bin/sh\necho hi', 'utf-8')
      await writeExtensions([entry])

      await uninstallExtension('local')

      assert.deepEqual(await readExtensions(), [])
      await assert.rejects(stat(entry.path), { code: 'ENOENT' })
    })

    it('no-ops gracefully when extension is not installed', async () => {
      await assert.doesNotReject(uninstallExtension('nonexistent'))
    })

    it('rejects traversal names', async () => {
      await assert.rejects(uninstallExtension('../../../target'), /invalid characters/)
      await assert.rejects(uninstallExtension('..'), /invalid characters/)
    })

    it('removes the registry entry even when the directory is already gone', async () => {
      const entry: InstalledExtension = {
        name: 'gone',
        source: 'github:elastic/elastic-gone',
        path: join(extDir, 'elastic-gone'),
        entrypoint: join(extDir, 'elastic-gone', 'elastic-gone'),
      }
      await writeExtensions([entry])
      // directory already absent

      await uninstallExtension('gone')
      assert.deepEqual(await readExtensions(), [])
    })
  })

  describe('createLocalExtension', () => {
    it('creates the directory and scaffolds package.json', async () => {
      const { entry } = await createLocalExtension('demo')
      const pkg = JSON.parse(await readFile(join(entry.path, 'package.json'), 'utf-8'))
      assert.equal(pkg.name, 'elastic-demo')
      assert.equal(pkg.bin['elastic-demo'], './index.js')
    })

    it('scaffolds an executable index.js that outputs JSON', async () => {
      const { entry } = await createLocalExtension('demo')
      const script = await readFile(entry.entrypoint, 'utf-8')
      assert.ok(script.includes('JSON.stringify'), 'entrypoint should output JSON')
      assert.ok(script.includes('process.env.ELASTIC_ES_URL'), 'entrypoint should reference ELASTIC_ES_URL')
    })

    it('registers the extension in the store with local: source', async () => {
      const { entry } = await createLocalExtension('demo')
      const extensions = await readExtensions()
      assert.equal(extensions.length, 1)
      assert.equal(extensions[0]!.name, 'demo')
      assert.ok(extensions[0]!.source.startsWith('local:'), 'source should start with local:')
      assert.equal(extensions[0]!.entrypoint, entry.entrypoint)
    })

    it('accepts a custom target path', async () => {
      const customDir = join(tmpDir, 'custom-ext')
      const { entry } = await createLocalExtension('custom', customDir)
      assert.equal(entry.path, customDir)
      await assert.doesNotReject(stat(join(customDir, 'index.js')))
    })

    it('rejects names with invalid characters', async () => {
      await assert.rejects(createLocalExtension('BAD_NAME'), /invalid characters/)
    })

    it('rejects names with path traversal characters', async () => {
      await assert.rejects(createLocalExtension('../escape'), /invalid characters/)
    })
  })

  describe('upgradeExtension', () => {
    it('throws when the extension is not installed', async () => {
      await assert.rejects(upgradeExtension('nonexistent'), /not installed/)
    })
  })

  describe('upgradeAllExtensions', () => {
    it('returns empty array when no extensions are installed', async () => {
      const results = await upgradeAllExtensions()
      assert.deepEqual(results, [])
    })
  })

  describe('installExtension -- --ignore-scripts', () => {
    afterEach(() => _testSetRun(undefined))

    it('passes --ignore-scripts and a scrubbed env when installing a github extension that has package.json', async () => {
      const captured: Array<{ cmd: string, args: string[], env?: Record<string, string> }> = []
      _testSetRun((cmd, args, _cwd, env) => { captured.push({ cmd, args, env }) })

      // Pre-populate installDir so git-clone mock + entrypoint discovery work without network
      const installDir = join(extDir, 'elastic-ghpkg')
      await mkdir(installDir, { recursive: true })
      await writeFile(join(installDir, 'package.json'), JSON.stringify({ name: 'elastic-ghpkg', version: '1.0.0' }), 'utf-8')
      const ep = join(installDir, 'elastic-ghpkg')
      await writeFile(ep, '#!/bin/sh\necho hi', 'utf-8')
      await chmod(ep, 0o755)

      const originalEnv = process.env
      ;(process as NodeJS.Process).env = { ...process.env, GITHUB_TOKEN: 'leak-me-not' }
      try {
        await installExtension('github:test-org/elastic-ghpkg')
      } finally {
        ;(process as NodeJS.Process).env = originalEnv
      }

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
      assert.ok(npmInstall.env != null, 'expected npm install to receive an env object')
      assert.ok(!('GITHUB_TOKEN' in npmInstall.env), 'GITHUB_TOKEN must not reach npm install')

      const gitClone = captured.find(c => c.cmd === 'git' && c.args.includes('clone'))
      assert.ok(gitClone?.env != null, 'expected git clone to receive an env object')
      assert.ok(!('GITHUB_TOKEN' in gitClone.env), 'GITHUB_TOKEN must not reach git clone')
    })

    it('passes --ignore-scripts and a scrubbed env when installing an npm extension', async () => {
      const captured: Array<{ cmd: string, args: string[], env?: Record<string, string> }> = []
      _testSetRun((cmd, args, _cwd, env) => { captured.push({ cmd, args, env }) })

      // Pre-populate the binary so entrypoint discovery succeeds without a real npm install
      const installDir = join(extDir, 'elastic-npmpkg')
      const binDir = join(installDir, 'node_modules', '.bin')
      await mkdir(binDir, { recursive: true })
      const bin = join(binDir, 'elastic-npmpkg')
      await writeFile(bin, '#!/bin/sh\necho hi', 'utf-8')
      await chmod(bin, 0o755)

      const originalEnv = process.env
      ;(process as NodeJS.Process).env = { ...process.env, NPM_TOKEN: 'leak-me-not' }
      try {
        await installExtension('npm:elastic-npmpkg')
      } finally {
        ;(process as NodeJS.Process).env = originalEnv
      }

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
      assert.ok(npmInstall.env != null, 'expected npm install to receive an env object')
      assert.ok(!('NPM_TOKEN' in npmInstall.env), 'NPM_TOKEN must not reach npm install')
    })
  })

  describe('upgradeExtension -- --ignore-scripts', () => {
    afterEach(() => _testSetRun(undefined))

    it('passes --ignore-scripts and a scrubbed env when upgrading a github extension that has package.json', async () => {
      const captured: Array<{ cmd: string, args: string[], env?: Record<string, string> }> = []
      _testSetRun((cmd, args, _cwd, env) => { captured.push({ cmd, args, env }) })

      const extPath = join(extDir, 'elastic-ghupgrade')
      await mkdir(extPath, { recursive: true })
      const ep = join(extPath, 'elastic-ghupgrade')
      await writeFile(ep, '#!/bin/sh\necho hi', 'utf-8')
      await chmod(ep, 0o755)
      await writeFile(join(extPath, 'package.json'), JSON.stringify({ name: 'elastic-ghupgrade', version: '1.0.0' }), 'utf-8')

      const entry: InstalledExtension = {
        name: 'ghupgrade',
        source: 'github:test-org/elastic-ghupgrade',
        path: extPath,
        entrypoint: ep,
      }
      await writeExtensions([entry])

      const originalEnv = process.env
      ;(process as NodeJS.Process).env = { ...process.env, GITHUB_TOKEN: 'leak-me-not' }
      try {
        await upgradeExtension('ghupgrade')
      } finally {
        ;(process as NodeJS.Process).env = originalEnv
      }

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
      assert.ok(npmInstall.env != null, 'expected npm install to receive an env object')
      assert.ok(!('GITHUB_TOKEN' in npmInstall.env), 'GITHUB_TOKEN must not reach npm install')

      const gitPull = captured.find(c => c.cmd === 'git' && c.args.includes('pull'))
      assert.ok(gitPull?.env != null, 'expected git pull to receive an env object')
      assert.ok(!('GITHUB_TOKEN' in gitPull.env), 'GITHUB_TOKEN must not reach git pull')
    })

    it('passes --ignore-scripts and a scrubbed env when upgrading an npm extension', async () => {
      const captured: Array<{ cmd: string, args: string[], env?: Record<string, string> }> = []
      _testSetRun((cmd, args, _cwd, env) => { captured.push({ cmd, args, env }) })

      const extPath = join(extDir, 'elastic-npmupgrade')
      await mkdir(extPath, { recursive: true })
      const ep = join(extPath, 'index.js')
      await writeFile(ep, '#!/usr/bin/env node\n', 'utf-8')

      const entry: InstalledExtension = {
        name: 'npmupgrade',
        source: 'npm:elastic-npmupgrade',
        path: extPath,
        entrypoint: ep,
      }
      await writeExtensions([entry])

      const originalEnv = process.env
      ;(process as NodeJS.Process).env = { ...process.env, NPM_TOKEN: 'leak-me-not' }
      try {
        await upgradeExtension('npmupgrade')
      } finally {
        ;(process as NodeJS.Process).env = originalEnv
      }

      const npmUpdate = captured.find(c => c.cmd === 'npm' && c.args.includes('update'))
      assert.ok(npmUpdate != null, 'expected npm update to be called')
      assert.ok(npmUpdate.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm update args')
      assert.ok(npmUpdate.env != null, 'expected npm update to receive an env object')
      assert.ok(!('NPM_TOKEN' in npmUpdate.env), 'NPM_TOKEN must not reach npm update')
    })
  })
})
