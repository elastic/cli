/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createExplorer, resolveContext, loadConfig } from '../../src/config/loader.ts'
import type { ConfigFile, ResolvedConfig } from '../../src/config/types.ts'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VALID_CONFIG_YAML = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        username: elastic
        password: changeme
    kibana:
      url: http://localhost:5601
      auth:
        api_key: kb-key-123
  staging:
    elasticsearch:
      url: https://staging.example.com:9200
      auth:
        api_key: staging-key
`.trimStart()

const VALID_CONFIG_OBJECT: ConfigFile = {
  'current_context': 'local',
  contexts: {
    local: {
      elasticsearch: { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
      kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key-123' } },
    },
    staging: {
      elasticsearch: { url: 'https://staging.example.com:9200', auth: { api_key: 'staging-key' } },
    },
  },
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('createExplorer', () => {
  it('exports a createExplorer function', () => {
    assert.equal(typeof createExplorer, 'function')
  })

  describe('search()', () => {
    let tmpDir: string
    before(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
      await writeFile(join(tmpDir, '.elasticrc.yml'), VALID_CONFIG_YAML)
    })
    after(async () => rm(tmpDir, { recursive: true }))

    it('discovers a .elasticrc.yml file by searching from a directory', async () => {
      const explorer = createExplorer()
      const result = await explorer.search(tmpDir)
      assert.ok(result != null, 'search() should find the config file')
      assert.ok(result!.config != null, 'result.config should be the parsed YAML object')
      assert.equal(result!.config['current_context'], 'local')
    })
  })

  describe('load()', () => {
    let tmpDir: string
    let configPath: string
    before(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
      configPath = join(tmpDir, 'myconfig.yml')
      await writeFile(configPath, VALID_CONFIG_YAML)
    })
    after(async () => rm(tmpDir, { recursive: true }))

    it('loads a config file from an explicit path', async () => {
      const explorer = createExplorer()
      const result = await explorer.load(configPath)
      assert.ok(result != null, 'load() should return a result for a valid path')
      assert.equal(result!.config['current_context'], 'local')
    })

    it('returns the absolute file path in the result', async () => {
      const explorer = createExplorer()
      const result = await explorer.load(configPath)
      assert.ok(result != null)
      assert.equal(result!.filepath, configPath)
    })
  })
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('resolveContext', () => {
  it('exports a resolveContext function', () => {
    assert.equal(typeof resolveContext, 'function')
  })

  it('returns a ResolvedConfig containing only the requested context\'s service blocks', () => {
    const resolved = resolveContext(VALID_CONFIG_OBJECT, 'local')
    assert.deepEqual(resolved, {
      context: {
        elasticsearch: { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
        kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key-123' } },
      },
    } satisfies ResolvedConfig)
  })

  it('resolves a different context by name', () => {
    const resolved = resolveContext(VALID_CONFIG_OBJECT, 'staging')
    assert.deepEqual(resolved, {
      context: {
        elasticsearch: { url: 'https://staging.example.com:9200', auth: { api_key: 'staging-key' } },
      },
    } satisfies ResolvedConfig)
  })

  it('does not include services that are not configured in the context', () => {
    const resolved = resolveContext(VALID_CONFIG_OBJECT, 'staging')
    assert.equal(resolved.context.kibana, undefined)
    assert.equal(resolved.context.cloud, undefined)
  })

  it('does not expose other contexts in the resolved output', () => {
    const resolved = resolveContext(VALID_CONFIG_OBJECT, 'local')
    assert.ok(!('contexts' in resolved), 'resolved output must not contain other contexts')
    assert.ok(!('current_context' in resolved), 'resolved output must not contain current_context')
  })
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('loadConfig -- default current_context', () => {
  it('exports a loadConfig function', () => {
    assert.equal(typeof loadConfig, 'function')
  })

  let tmpDir: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    await writeFile(join(tmpDir, '.elasticrc.yml'), VALID_CONFIG_YAML)
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('discovers, validates, and resolves the default current_context', async () => {
    const result = await loadConfig({ searchFrom: tmpDir })
    assert.ok(result.ok, `loadConfig should succeed, got: ${!result.ok ? result.error : ''}`)
    if (!result.ok) return
    assert.deepEqual(result.value, {
      context: {
        elasticsearch: { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
        kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key-123' } },
      },
    } satisfies ResolvedConfig)
  })
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('loadConfig -- --use-context override', () => {
  let tmpDir: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    await writeFile(join(tmpDir, '.elasticrc.yml'), VALID_CONFIG_YAML)
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('uses the supplied contextName vs current_context', async () => {
    const result = await loadConfig({ searchFrom: tmpDir, contextName: 'staging' })
    assert.ok(result.ok, `loadConfig should succeed with --use-context staging`)
    if (!result.ok) return
    assert.deepEqual(result.value, {
      context: {
        elasticsearch: { url: 'https://staging.example.com:9200', auth: { api_key: 'staging-key' } },
      },
    } satisfies ResolvedConfig)
  })

  it('returns an error when the overridden context name does not exist', async () => {
    const result = await loadConfig({ searchFrom: tmpDir, contextName: 'nonexistent' })
    assert.ok(!result.ok, 'loadConfig should fail for a nonexistent context override')
    if (result.ok) return
    assert.ok(result.error.message.includes('nonexistent'), 'error message should name the missing context')
  })
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('loadConfig -- --config-file override', () => {
  let tmpDir: string
  let discoveryDir: string
  let explicitConfigPath: string
  before(async () => {
    // discoveryDir has NO config file -- would fail if discovery were used
    discoveryDir = await mkdtemp(join(tmpdir(), 'elastic-cli-empty-'))

    // The explicit config file lives elsewhere
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    explicitConfigPath = join(tmpDir, 'explicit.yml')
    await writeFile(explicitConfigPath, VALID_CONFIG_YAML)
  })
  after(async () => Promise.all([
    rm(tmpDir, { recursive: true }),
    rm(discoveryDir, { recursive: true }),
  ]))

  it('loads from the explicit configPath, bypassing discovery', async () => {
    const result = await loadConfig({ searchFrom: discoveryDir, configPath: explicitConfigPath })
    assert.ok(result.ok, `loadConfig should succeed with explicit --config-file path, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.deepEqual(result.value, {
      context: {
        elasticsearch: { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
        kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key-123' } },
      },
    } satisfies ResolvedConfig)
  })

  it('returns an error when the explicit path does not exist', async () => {
    const result = await loadConfig({ searchFrom: discoveryDir, configPath: join(tmpDir, 'does-not-exist.yml') })
    assert.ok(!result.ok, 'loadConfig should fail for a nonexistent explicit config path')
  })
})

// ---------------------------------------------------------------------------
// T019 — commands policy threading through loadConfig and resolveContext
// ---------------------------------------------------------------------------

describe('T019: commands policy in ResolvedConfig', () => {
  let tmpDir: string
  after(async () => rm(tmpDir, { recursive: true }))
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-policy-'))
  })

  it('resolveContext includes commands policy when present', () => {
    const config: ConfigFile = {
      ...VALID_CONFIG_OBJECT,
      commands: { allowed: ['ping', 'elasticsearch.search'] },
    }
    const resolved = resolveContext(config, 'local')
    assert.deepEqual(resolved.commands, { allowed: ['ping', 'elasticsearch.search'] })
  })

  it('resolveContext omits commands when not present in config', () => {
    const resolved = resolveContext(VALID_CONFIG_OBJECT, 'local')
    assert.equal(resolved.commands, undefined)
  })

  it('loadConfig threads allowed list into ResolvedConfig', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
commands:
  allowed:
    - ping
    - elasticsearch.search
`.trimStart()
    const configPath = join(tmpDir, 'allowed.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.deepEqual(result.value.commands, { allowed: ['ping', 'elasticsearch.search'] })
  })

  it('loadConfig threads blocked list into ResolvedConfig', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
commands:
  blocked:
    - elasticsearch.bulk
    - config.*
`.trimStart()
    const configPath = join(tmpDir, 'blocked.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.deepEqual(result.value.commands, { blocked: ['elasticsearch.bulk', 'config.*'] })
  })

  it('loadConfig returns error for config with both allowed and blocked', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
commands:
  allowed:
    - ping
  blocked:
    - elasticsearch.bulk
`.trimStart()
    const configPath = join(tmpDir, 'both.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'should fail when both allowed and blocked are present')
    if (result.ok) return
    assert.match(result.error.message, /mutually exclusive/)
  })
})
