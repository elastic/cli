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
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installExtension, uninstallExtension, _testSetExtensionsDir } from '../../src/extension/installer.ts'
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
})
