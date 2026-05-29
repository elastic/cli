/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  readExtensions,
  writeExtensions,
  findExtension,
  upsertExtension,
  removeExtension,
  _testSetRegistryPath,
  _testSetPlatform,
} from '../../src/extension/store.ts'
import type { InstalledExtension } from '../../src/extension/store.ts'

const ext1: InstalledExtension = {
  name: 'local',
  source: 'github:elastic/elastic-local',
  path: '/home/user/.elastic/extensions/elastic-local',
  entrypoint: '/home/user/.elastic/extensions/elastic-local/elastic-local',
}

const ext2: InstalledExtension = {
  name: 'diag',
  source: 'github:elastic/esdiag',
  path: '/home/user/.elastic/extensions/elastic-diag',
  entrypoint: '/home/user/.elastic/extensions/elastic-diag/esdiag',
}

describe('extension store', () => {
  let tmpDir: string
  let registryFile: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-ext-store-'))
    registryFile = join(tmpDir, 'extensions.json')
    _testSetRegistryPath(registryFile)
  })

  after(async () => {
    _testSetRegistryPath(undefined)
    await rm(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    // wipe registry between tests
    await writeExtensions([])
  })

  describe('readExtensions', () => {
    it('returns empty array when registry does not exist', async () => {
      _testSetRegistryPath(join(tmpDir, 'nonexistent', 'extensions.json'))
      const result = await readExtensions()
      assert.deepEqual(result, [])
      _testSetRegistryPath(registryFile)
    })

    it('returns the persisted extensions', async () => {
      await writeExtensions([ext1, ext2])
      const result = await readExtensions()
      assert.deepEqual(result, [ext1, ext2])
    })
  })

  describe('writeExtensions', () => {
    it('creates the parent directory if missing', async () => {
      const nested = join(tmpDir, 'subdir', 'extensions.json')
      _testSetRegistryPath(nested)
      try {
        await writeExtensions([ext1])
        const raw = await readFile(nested, 'utf-8')
        assert.deepEqual(JSON.parse(raw), [ext1])
      } finally {
        _testSetRegistryPath(registryFile)
      }
    })

    it('writes valid JSON with a trailing newline', async () => {
      await writeExtensions([ext1])
      const raw = await readFile(registryFile, 'utf-8')
      assert.ok(raw.endsWith('\n'), 'expected trailing newline')
      assert.doesNotThrow(() => JSON.parse(raw))
    })

    it('overwrites existing content', async () => {
      await writeExtensions([ext1, ext2])
      await writeExtensions([ext2])
      const result = await readExtensions()
      assert.deepEqual(result, [ext2])
    })

    it('writes file with 0o600 permissions (Unix only)', async () => {
      if (process.platform === 'win32') return
      await writeExtensions([ext1])
      const s = await stat(registryFile)
      const mode = s.mode & 0o777
      assert.equal(mode, 0o600, `expected 0o600 permissions, got 0o${mode.toString(8)}`)
    })

    it('skips chmod on win32 without throwing', async () => {
      _testSetPlatform('win32')
      try {
        await assert.doesNotReject(writeExtensions([ext1]))
      } finally {
        _testSetPlatform(process.platform)
      }
    })
  })

  describe('findExtension', () => {
    it('returns undefined when registry is empty', async () => {
      assert.equal(await findExtension('local'), undefined)
    })

    it('returns undefined when name is not found', async () => {
      await writeExtensions([ext1])
      assert.equal(await findExtension('diag'), undefined)
    })

    it('returns the matching extension', async () => {
      await writeExtensions([ext1, ext2])
      assert.deepEqual(await findExtension('local'), ext1)
      assert.deepEqual(await findExtension('diag'), ext2)
    })
  })

  describe('upsertExtension', () => {
    it('adds a new entry when name is not present', async () => {
      const overwritten = await upsertExtension(ext1)
      assert.equal(overwritten, false)
      assert.deepEqual(await readExtensions(), [ext1])
    })

    it('replaces an existing entry with the same name', async () => {
      await upsertExtension(ext1)
      const updated: InstalledExtension = { ...ext1, source: 'github:elastic/elastic-local-v2' }
      const overwritten = await upsertExtension(updated)
      assert.equal(overwritten, true)
      const result = await readExtensions()
      assert.equal(result.length, 1)
      assert.deepEqual(result[0], updated)
    })

    it('preserves other entries when upserting', async () => {
      await writeExtensions([ext1, ext2])
      const updated: InstalledExtension = { ...ext2, path: '/new/path' }
      await upsertExtension(updated)
      const result = await readExtensions()
      assert.equal(result.length, 2)
      assert.deepEqual(result.find((e) => e.name === 'diag'), updated)
      assert.deepEqual(result.find((e) => e.name === 'local'), ext1)
    })
  })

  describe('removeExtension', () => {
    it('no-ops when name is not found', async () => {
      await writeExtensions([ext1])
      await removeExtension('nonexistent')
      assert.deepEqual(await readExtensions(), [ext1])
    })

    it('removes the matching entry', async () => {
      await writeExtensions([ext1, ext2])
      await removeExtension('local')
      assert.deepEqual(await readExtensions(), [ext2])
    })

    it('leaves an empty registry when the last entry is removed', async () => {
      await writeExtensions([ext1])
      await removeExtension('local')
      assert.deepEqual(await readExtensions(), [])
    })
  })

  describe('readExtensions -- tampered/malformed registry (security)', () => {
    it('throws when the file is not valid JSON', async () => {
      await writeFile(registryFile, 'not json', 'utf-8')
      await assert.rejects(readExtensions(), /not valid JSON/)
    })

    it('throws when the top level is not an array', async () => {
      await writeFile(registryFile, '{"name":"local"}', 'utf-8')
      await assert.rejects(readExtensions(), /expected a JSON array/)
    })

    it('throws when an entry is missing a required field', async () => {
      await writeFile(registryFile, JSON.stringify([{ name: 'local', source: 'github:x/y' }]), 'utf-8')
      await assert.rejects(readExtensions(), /path must be a non-empty string/)
    })

    it('throws when name contains path traversal characters', async () => {
      const bad = { ...ext1, name: '../evil' }
      await writeFile(registryFile, JSON.stringify([bad]), 'utf-8')
      await assert.rejects(readExtensions(), /invalid characters/)
    })

    it('throws when name contains a null byte', async () => {
      const bad = { ...ext1, name: 'local\x00evil' }
      await writeFile(registryFile, JSON.stringify([bad]), 'utf-8')
      await assert.rejects(readExtensions(), /invalid characters/)
    })

    it('throws when entrypoint is a relative path', async () => {
      const bad = { ...ext1, entrypoint: 'relative/path/elastic-local' }
      await writeFile(registryFile, JSON.stringify([bad]), 'utf-8')
      await assert.rejects(readExtensions(), /must be an absolute path/)
    })

    it('throws when path is a relative path', async () => {
      const bad = { ...ext1, path: '../outside' }
      await writeFile(registryFile, JSON.stringify([bad]), 'utf-8')
      await assert.rejects(readExtensions(), /must be an absolute path/)
    })

    it('throws when source does not match a recognised format', async () => {
      const bad = { ...ext1, source: 'justaplainstring' }
      await writeFile(registryFile, JSON.stringify([bad]), 'utf-8')
      await assert.rejects(readExtensions(), /does not match a recognised format/)
    })
  })

  describe('removeExtension -- no-op write optimisation', () => {
    it('does not write when name is not found', async () => {
      await writeExtensions([ext1])
      const statBefore = await import('node:fs/promises').then((m) => m.stat(registryFile))
      await removeExtension('nonexistent')
      const statAfter = await import('node:fs/promises').then((m) => m.stat(registryFile))
      assert.equal(statBefore.mtimeMs, statAfter.mtimeMs, 'mtime should not change when no entry was removed')
    })
  })
})
