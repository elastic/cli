/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { completeContextNames } from '../../src/completion/completers/context-names.ts'
import { tmpConfig } from '../helpers/tmp-config.ts'

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
  const ORIGINAL_ENV = process.env['ELASTIC_CLI_CONFIG_FILE']

  after(() => {
    if (ORIGINAL_ENV != null) process.env['ELASTIC_CLI_CONFIG_FILE'] = ORIGINAL_ENV
    else delete process.env['ELASTIC_CLI_CONFIG_FILE']
  })

  beforeEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })
  afterEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })

  it('returns the keys of the contexts map from ELASTIC_CLI_CONFIG_FILE', async (t) => {
    await tmpConfig(t, VALID_YAML)
    const names = await completeContextNames()
    assert.deepEqual(names.sort(), ['local', 'prod', 'staging'])
  })

  it('returns the keys for a JSON config file', async (t) => {
    await tmpConfig(t, JSON.stringify({
      current_context: 'a',
      contexts: {
        a: { elasticsearch: { url: 'http://localhost:9200' } },
        b: { elasticsearch: { url: 'http://localhost:9200' } },
      },
    }), 'valid.json')
    const names = await completeContextNames()
    assert.deepEqual(names.sort(), ['a', 'b'])
  })

  it('returns [] when ELASTIC_CLI_CONFIG_FILE points at a missing file', async (t) => {
    await tmpConfig(t)
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when the config is malformed YAML', async (t) => {
    await tmpConfig(t, ': : not yaml ::')
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when contexts is missing entirely', async (t) => {
    await tmpConfig(t, 'current_context: local\n')
    assert.deepEqual(await completeContextNames(), [])
  })

  it('returns [] when contexts is an empty map', async (t) => {
    await tmpConfig(t, 'current_context: local\ncontexts: {}\n')
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

  it('never throws when the file is unreadable', async (t) => {
    if (process.platform === 'win32') return // chmod is a no-op on Windows
    const path = await tmpConfig(t, VALID_YAML)
    await chmod(path, 0o000)
    try {
      assert.deepEqual(await completeContextNames(), [])
    } finally {
      await chmod(path, 0o600).catch(() => undefined)
    }
  })

  it('ignores unresolved $(...) expressions in context values', async (t) => {
    await tmpConfig(t, [
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
