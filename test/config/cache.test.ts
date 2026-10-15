/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, clearConfigCache } from '../../src/config/loader.ts'

const VALID_CONFIG_YAML = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: test-key
  remote:
    elasticsearch:
      url: http://localhost:9201
      auth:
        api_key: remote-key
`.trimStart()

const OTHER_CONFIG_YAML = `
current_context: other
contexts:
  other:
    elasticsearch:
      url: http://localhost:9300
      auth:
        api_key: other-key
`.trimStart()

describe('loadConfig caching', () => {
  let tmpDir: string
  let configPath: string
  let otherConfigPath: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-cache-test-'))
    configPath = join(tmpDir, '.elasticrc.yml')
    await writeFile(configPath, VALID_CONFIG_YAML, 'utf-8')
    otherConfigPath = join(tmpDir, 'other.yml')
    await writeFile(otherConfigPath, OTHER_CONFIG_YAML, 'utf-8')
  })

  after(async () => rm(tmpDir, { recursive: true }))

  afterEach(() => clearConfigCache())

  it('returns the same reference on repeated calls (cache hit)', async () => {
    const first = await loadConfig({ configPath })
    const second = await loadConfig({ configPath })
    assert.equal(first, second, 'expected same object reference from cache')
  })

  it('returns a fresh result when refresh: true', async () => {
    const first = await loadConfig({ configPath })
    const second = await loadConfig({ configPath, refresh: true })
    assert.notEqual(first, second, 'expected a new object when refresh is true')
    assert.deepEqual(first, second, 'expected same shape after refresh')
  })

  it('clearConfigCache resets to undefined so next call loads fresh', async () => {
    const first = await loadConfig({ configPath })
    clearConfigCache()
    const second = await loadConfig({ configPath })
    assert.notEqual(first, second, 'expected a new object after cache was cleared')
    assert.deepEqual(first, second, 'expected same shape after re-load')
  })

  it('refresh: true updates the cache so subsequent default calls return the refreshed result', async () => {
    await loadConfig({ configPath })
    const refreshed = await loadConfig({ configPath, refresh: true })
    const subsequent = await loadConfig({ configPath })
    assert.equal(refreshed, subsequent, 'expected the refreshed result to be cached')
  })

  it('does not return a cached result for a different contextName', async () => {
    const first = await loadConfig({ configPath, contextName: 'local' })
    const second = await loadConfig({ configPath, contextName: 'remote' })
    assert.ok(first.ok && second.ok)
    assert.equal(second.contextName, 'remote')
    assert.equal(second.value.context.elasticsearch?.url, 'http://localhost:9201')
  })

  it('does not return a cached result for a different configPath', async () => {
    await loadConfig({ configPath })
    const second = await loadConfig({ configPath: otherConfigPath })
    assert.ok(second.ok)
    assert.equal(second.contextName, 'other')
  })

  it('does not return a cached result after ELASTIC_CLI_CONFIG_FILE changes', async () => {
    const saved = process.env.ELASTIC_CLI_CONFIG_FILE
    try {
      process.env.ELASTIC_CLI_CONFIG_FILE = configPath
      await loadConfig()
      process.env.ELASTIC_CLI_CONFIG_FILE = otherConfigPath
      const second = await loadConfig()
      assert.ok(second.ok)
      assert.equal(second.contextName, 'other')
    } finally {
      if (saved === undefined) delete process.env.ELASTIC_CLI_CONFIG_FILE
      else process.env.ELASTIC_CLI_CONFIG_FILE = saved
    }
  })
})
