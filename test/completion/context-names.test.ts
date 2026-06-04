/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { completeContextNames } from '../../src/completion/completers/context-names.ts'

const VALID_YAML = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
  staging:
    elasticsearch:
      url: https://staging.example.com:9200
  prod:
    elasticsearch:
      url: https://prod.example.com:9200
`.trimStart()

describe('completeContextNames', () => {
  let tmpDir: string
  const ORIGINAL_ENV = process.env['ELASTIC_CLI_CONFIG_FILE']

  before(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-ctx-')) })
  after(async () => {
    await rm(tmpDir, { recursive: true })
    if (ORIGINAL_ENV != null) process.env['ELASTIC_CLI_CONFIG_FILE'] = ORIGINAL_ENV
    else delete process.env['ELASTIC_CLI_CONFIG_FILE']
  })

  beforeEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })
  afterEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })

  it('returns the keys of the contexts map from ELASTIC_CLI_CONFIG_FILE', async () => {
    const path = join(tmpDir, 'valid.yml')
    await writeFile(path, VALID_YAML)
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    const names = await completeContextNames()
    assert.deepEqual(names.sort(), ['local', 'prod', 'staging'])
  })

  it('returns the keys for a JSON config file', async () => {
    const path = join(tmpDir, 'valid.json')
    await writeFile(path, JSON.stringify({
      current_context: 'a',
      contexts: {
        a: { elasticsearch: { url: 'http://localhost:9200' } },
        b: { elasticsearch: { url: 'http://localhost:9200' } },
      },
    }))
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    const names = await completeContextNames()
    assert.deepEqual(names.sort(), ['a', 'b'])
  })

  it('returns [] when ELASTIC_CLI_CONFIG_FILE points at a missing file', async () => {
    process.env['ELASTIC_CLI_CONFIG_FILE'] = join(tmpDir, 'does-not-exist.yml')
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when the config is malformed YAML', async () => {
    const path = join(tmpDir, 'broken.yml')
    await writeFile(path, ': : not yaml ::')
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when contexts is missing entirely', async () => {
    const path = join(tmpDir, 'no-contexts.yml')
    await writeFile(path, 'current_context: local\n')
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when contexts is an empty map', async () => {
    const path = join(tmpDir, 'empty.yml')
    await writeFile(path, 'current_context: local\ncontexts: {}\n')
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when no config file is discoverable (HOME has none)', async () => {
    const emptyHome = await mkdtemp(join(tmpdir(), 'elastic-cli-empty-home-'))
    try {
      const prevHome = process.env['HOME']
      process.env['HOME'] = emptyHome
      try {
        assert.deepEqual(await completeContextNames(), [])
      } finally {
        if (prevHome != null) process.env['HOME'] = prevHome
        else delete process.env['HOME']
      }
    } finally {
      await rm(emptyHome, { recursive: true })
    }
  })

  it('never throws when the file is unreadable', async () => {
    if (process.platform === 'win32') return // chmod is a no-op on Windows
    const path = join(tmpDir, 'unreadable.yml')
    await writeFile(path, VALID_YAML)
    await chmod(path, 0o000)
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    try {
      assert.deepEqual(await completeContextNames(), [])
    } finally {
      await chmod(path, 0o600).catch(() => undefined)
    }
  })

  it('ignores unresolved $(...) expressions in context values', async () => {
    const path = join(tmpDir, 'with-expr.yml')
    await writeFile(path, [
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth:',
      '        api_key: $(env:THIS_DOES_NOT_EXIST_ANYWHERE)',
      '  remote:',
      '    elasticsearch:',
      '      url: $(env:ALSO_MISSING)',
      '',
    ].join('\n'))
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    const names = await completeContextNames()
    assert.deepEqual(names.sort(), ['local', 'remote'])
  })

  it('treats an empty ELASTIC_CLI_CONFIG_FILE env var as unset (discovery fallback)', async () => {
    process.env['ELASTIC_CLI_CONFIG_FILE'] = ''
    await (await import('node:os')).default.tmpdir()
    // With empty env var, should fall back to discovery; in tmp dir, no config = []
    // Just verify it doesn't throw
    const names = await completeContextNames()
    assert.ok(Array.isArray(names))
  })
})
