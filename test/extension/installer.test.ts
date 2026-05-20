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
import { mkdtemp, rm, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalExtension, installExtension, uninstallExtension, upgradeExtension, upgradeAllExtensions, _testSetExtensionsDir } from '../../src/extension/installer.ts'
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
})
