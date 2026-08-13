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
import { mkdtemp, rm, mkdir, readFile, stat, writeFile, symlink, chmod } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
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

    it('rejects a --path entrypoint that is a symlink escaping the install directory (#500)', async () => {
      const outsideDir = await mkdtemp(join(tmpdir(), 'elastic-outside-'))
      try {
        const payload = join(outsideDir, 'payload.sh')
        await writeFile(payload, '#!/bin/sh\necho PAYLOAD RAN FROM OUTSIDE\n', { mode: 0o755 })

        const targetDir = join(tmpDir, 'symlink-escape-ext')
        await mkdir(targetDir, { recursive: true })
        await symlink(payload, join(targetDir, 'elastic-symlinktest'))

        await assert.rejects(
          createLocalExtension('symlinktest', targetDir),
          /outside the install directory/
        )

        // Refusing to register also means the store stays empty.
        assert.deepEqual(await readExtensions(), [])
      } finally {
        await rm(outsideDir, { recursive: true, force: true })
      }
    })

    it('accepts a --path entrypoint that is a real (non-symlink) file inside the install directory', async () => {
      const targetDir = join(tmpDir, 'real-entrypoint-ext')
      await mkdir(targetDir, { recursive: true })
      const entrypointPath = join(targetDir, 'elastic-realtest')
      await writeFile(entrypointPath, '#!/bin/sh\necho hi\n', { mode: 0o755 })
      await chmod(entrypointPath, 0o755)

      const { entry } = await createLocalExtension('realtest', targetDir)
      assert.equal(entry.entrypoint, entrypointPath)
      const extensions = await readExtensions()
      assert.equal(extensions.length, 1)
      assert.equal(extensions[0]!.entrypoint, entrypointPath)
    })
  })

  describe('upgradeExtension', () => {
    it('throws when the extension is not installed', async () => {
      await assert.rejects(upgradeExtension('nonexistent'), /not installed/)
    })

    it('rejects a post-pull entrypoint that is a symlink escaping the install directory (#500)', async () => {
      const remoteDir = await mkdtemp(join(tmpdir(), 'elastic-remote-'))
      const outsideDir = await mkdtemp(join(tmpdir(), 'elastic-outside-'))
      const extPath = join(extDir, 'elastic-symupgrade')
      try {
        // Bootstrap a local git remote so git pull --ff-only succeeds (already up to date).
        const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@t.com' }
        spawnSync('git', ['init', remoteDir], { encoding: 'utf-8' })
        spawnSync('git', ['-C', remoteDir, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf-8', env: gitEnv })
        spawnSync('git', ['clone', remoteDir, extPath], { encoding: 'utf-8' })

        // Place a symlink whose target is outside the install dir — simulates a
        // malicious commit pulled in by git pull.
        const payload = join(outsideDir, 'elastic-symupgrade')
        await writeFile(payload, '#!/bin/sh\necho PAYLOAD\n', { mode: 0o755 })
        await symlink(payload, join(extPath, 'elastic-symupgrade'))

        const entry: InstalledExtension = {
          name: 'symupgrade',
          source: 'github:elastic/elastic-symupgrade',
          path: extPath,
          entrypoint: join(extPath, 'elastic-symupgrade'),
        }
        await writeExtensions([entry])

        await assert.rejects(upgradeExtension('symupgrade'), /outside the install directory/)
      } finally {
        await rm(remoteDir, { recursive: true, force: true })
        await rm(outsideDir, { recursive: true, force: true })
      }
    })

    it('rejects a stored entrypoint that is a symlink escaping the install directory after npm update (#500)', async () => {
      const outsideDir = await mkdtemp(join(tmpdir(), 'elastic-outside-'))
      const extPath = join(extDir, 'elastic-npmupgrade')
      try {
        await mkdir(extPath, { recursive: true })
        await writeFile(join(extPath, 'package.json'), JSON.stringify({ name: 'elastic-npmupgrade', version: '1.0.0' }), 'utf-8')

        // Simulates a symlink left behind under node_modules/.bin by npm update.
        const payload = join(outsideDir, 'payload.sh')
        await writeFile(payload, '#!/bin/sh\necho PAYLOAD\n', { mode: 0o755 })
        await symlink(payload, join(extPath, 'elastic-npmupgrade'))

        const entry: InstalledExtension = {
          name: 'npmupgrade',
          source: 'npm:elastic-npmupgrade',
          path: extPath,
          entrypoint: join(extPath, 'elastic-npmupgrade'),
        }
        await writeExtensions([entry])

        await assert.rejects(upgradeExtension('npmupgrade'), /outside the install directory/)
      } finally {
        await rm(outsideDir, { recursive: true, force: true })
      }
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

    it('passes --ignore-scripts when installing a github extension that has package.json', async () => {
      const captured: Array<{ cmd: string, args: string[] }> = []
      _testSetRun((cmd, args) => { captured.push({ cmd, args }) })

      // Pre-populate installDir so git-clone mock + entrypoint discovery work without network
      const installDir = join(extDir, 'elastic-ghpkg')
      await mkdir(installDir, { recursive: true })
      await writeFile(join(installDir, 'package.json'), JSON.stringify({ name: 'elastic-ghpkg', version: '1.0.0' }), 'utf-8')
      const ep = join(installDir, 'elastic-ghpkg')
      await writeFile(ep, '#!/bin/sh\necho hi', 'utf-8')
      await chmod(ep, 0o755)

      await installExtension('github:test-org/elastic-ghpkg')

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
    })

    it('passes --ignore-scripts when installing an npm extension', async () => {
      const captured: Array<{ cmd: string, args: string[] }> = []
      _testSetRun((cmd, args) => { captured.push({ cmd, args }) })

      // Pre-populate the binary so entrypoint discovery succeeds without a real npm install
      const installDir = join(extDir, 'elastic-npmpkg')
      const binDir = join(installDir, 'node_modules', '.bin')
      await mkdir(binDir, { recursive: true })
      const bin = join(binDir, 'elastic-npmpkg')
      await writeFile(bin, '#!/bin/sh\necho hi', 'utf-8')
      await chmod(bin, 0o755)

      await installExtension('npm:elastic-npmpkg')

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
    })
  })

  describe('upgradeExtension -- --ignore-scripts', () => {
    afterEach(() => _testSetRun(undefined))

    it('passes --ignore-scripts when upgrading a github extension that has package.json', async () => {
      const captured: Array<{ cmd: string, args: string[] }> = []
      _testSetRun((cmd, args) => { captured.push({ cmd, args }) })

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

      await upgradeExtension('ghupgrade')

      const npmInstall = captured.find(c => c.cmd === 'npm' && c.args.includes('install'))
      assert.ok(npmInstall != null, 'expected npm install to be called')
      assert.ok(npmInstall.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm install args')
    })

    it('passes --ignore-scripts when upgrading an npm extension', async () => {
      const captured: Array<{ cmd: string, args: string[] }> = []
      _testSetRun((cmd, args) => { captured.push({ cmd, args }) })

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

      await upgradeExtension('npmupgrade')

      const npmUpdate = captured.find(c => c.cmd === 'npm' && c.args.includes('update'))
      assert.ok(npmUpdate != null, 'expected npm update to be called')
      assert.ok(npmUpdate.args.includes('--ignore-scripts'), '--ignore-scripts should be in npm update args')
    })
  })
})
