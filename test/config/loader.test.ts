/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfigFile, discoverConfigFile, resolveContext, resolveEffectiveCommands, loadConfig, clearConfigCache } from '../../src/config/loader.ts'
import type { ConfigFile, ResolvedConfig } from '../../src/config/types.ts'

afterEach(() => clearConfigCache())

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

describe('loadConfigFile', () => {
  let tmpDir: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('parses a YAML config file', async () => {
    const filePath = join(tmpDir, 'config.yml')
    await writeFile(filePath, VALID_CONFIG_YAML)
    const result = await loadConfigFile(filePath) as Record<string, unknown>
    assert.equal(result['current_context'], 'local')
  })

  it('parses a JSON config file', async () => {
    const filePath = join(tmpDir, 'config.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG_OBJECT))
    const result = await loadConfigFile(filePath) as Record<string, unknown>
    assert.equal(result['current_context'], 'local')
  })

  it('parses an extensionless file as YAML', async () => {
    const filePath = join(tmpDir, '.elasticrc')
    await writeFile(filePath, VALID_CONFIG_YAML)
    const result = await loadConfigFile(filePath) as Record<string, unknown>
    assert.equal(result['current_context'], 'local')
  })

  it('throws for nonexistent file', async () => {
    await assert.rejects(() => loadConfigFile(join(tmpDir, 'nope.yml')))
  })
})

// ---------------------------------------------------------------------------

describe('discoverConfigFile', () => {
  it('discovers a .elasticrc.yml in the given directory', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    await writeFile(join(tmpDir, '.elasticrc.yml'), VALID_CONFIG_YAML)
    const found = await discoverConfigFile(tmpDir)
    assert.ok(found != null)
    assert.ok(found!.endsWith('.elasticrc.yml'))
    await rm(tmpDir, { recursive: true })
  })

  it('returns null when no config exists', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'elastic-cli-empty-'))
    const found = await discoverConfigFile(emptyDir)
    assert.equal(found, null)
    await rm(emptyDir, { recursive: true })
  })

  it('does NOT discover config in parent directories (security regression)', async () => {
    const parentDir = await mkdtemp(join(tmpdir(), 'elastic-cli-parent-'))
    await writeFile(join(parentDir, '.elasticrc.yml'), VALID_CONFIG_YAML)
    const childDir = join(parentDir, 'subdir')
    await mkdir(childDir, { recursive: true })
    const found = await discoverConfigFile(childDir)
    assert.equal(found, null, 'must not walk up to parent directories')
    await rm(parentDir, { recursive: true })
  })

  it('prefers earlier file names within the same directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-order-'))
    await writeFile(join(dir, '.elasticrc.json'), JSON.stringify(VALID_CONFIG_OBJECT))
    await writeFile(join(dir, '.elasticrc.yml'), VALID_CONFIG_YAML)
    const found = await discoverConfigFile(dir)
    assert.ok(found!.endsWith('.elasticrc.json'))
    await rm(dir, { recursive: true })
  })

  it('returns null for a nonexistent directory', async () => {
    const found = await discoverConfigFile('/nonexistent/path')
    assert.equal(found, null)
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
  let configPath: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    configPath = join(tmpDir, '.elasticrc.yml')
    await writeFile(configPath, VALID_CONFIG_YAML)
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('discovers, validates, and resolves the default current_context', async () => {
    const result = await loadConfig({ configPath })
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
  let configPath: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
    configPath = join(tmpDir, '.elasticrc.yml')
    await writeFile(configPath, VALID_CONFIG_YAML)
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('uses the supplied contextName vs current_context', async () => {
    const result = await loadConfig({ configPath, contextName: 'staging' })
    assert.ok(result.ok, `loadConfig should succeed with --use-context staging`)
    if (!result.ok) return
    assert.deepEqual(result.value, {
      context: {
        elasticsearch: { url: 'https://staging.example.com:9200', auth: { api_key: 'staging-key' } },
      },
    } satisfies ResolvedConfig)
  })

  it('returns an error when the overridden context name does not exist', async () => {
    const result = await loadConfig({ configPath, contextName: 'nonexistent' })
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
    const result = await loadConfig({ configPath: explicitConfigPath })
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
    const result = await loadConfig({ configPath: join(tmpDir, 'does-not-exist.yml') })
    assert.ok(!result.ok, 'loadConfig should fail for a nonexistent explicit config path')
  })
})

// ---------------------------------------------------------------------------

describe('loadConfig -- ELASTIC_CLI_CONFIG_FILE env var', () => {
  let tmpDir: string
  let envConfigPath: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-envvar-'))
    envConfigPath = join(tmpDir, 'env-config.yml')
    await writeFile(envConfigPath, VALID_CONFIG_YAML)
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('loads config from ELASTIC_CLI_CONFIG_FILE when set', async () => {
    const original = process.env['ELASTIC_CLI_CONFIG_FILE']
    try {
      process.env['ELASTIC_CLI_CONFIG_FILE'] = envConfigPath
      const result = await loadConfig({})
      assert.ok(result.ok, `loadConfig should succeed via env var`)
      if (!result.ok) return
      assert.deepEqual(result.value, {
        context: {
          elasticsearch: { url: 'http://localhost:9200', auth: { username: 'elastic', password: 'changeme' } },
          kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key-123' } },
        },
      } satisfies ResolvedConfig)
    } finally {
      if (original === undefined) delete process.env['ELASTIC_CLI_CONFIG_FILE']
      else process.env['ELASTIC_CLI_CONFIG_FILE'] = original
    }
  })

  it('--config-file flag takes precedence over ELASTIC_CLI_CONFIG_FILE', async () => {
    const otherDir = await mkdtemp(join(tmpdir(), 'elastic-cli-other-'))
    const flagConfigPath = join(otherDir, 'flag-config.yml')
    const envYaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://env-host:9200
      auth:
        api_key: env-key
`.trimStart()
    const flagYaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://flag-host:9200
      auth:
        api_key: flag-key
`.trimStart()
    await writeFile(envConfigPath, envYaml)
    await writeFile(flagConfigPath, flagYaml)

    const original = process.env['ELASTIC_CLI_CONFIG_FILE']
    try {
      process.env['ELASTIC_CLI_CONFIG_FILE'] = envConfigPath
      const result = await loadConfig({ configPath: flagConfigPath })
      assert.ok(result.ok)
      if (!result.ok) return
      assert.equal(result.value.context.elasticsearch!.url, 'http://flag-host:9200')
    } finally {
      if (original === undefined) delete process.env['ELASTIC_CLI_CONFIG_FILE']
      else process.env['ELASTIC_CLI_CONFIG_FILE'] = original
      await rm(otherDir, { recursive: true })
    }
  })

  it('returns error when ELASTIC_CLI_CONFIG_FILE points to nonexistent file', async () => {
    const original = process.env['ELASTIC_CLI_CONFIG_FILE']
    try {
      process.env['ELASTIC_CLI_CONFIG_FILE'] = '/nonexistent/config.yml'
      const result = await loadConfig({})
      assert.ok(!result.ok)
    } finally {
      if (original === undefined) delete process.env['ELASTIC_CLI_CONFIG_FILE']
      else process.env['ELASTIC_CLI_CONFIG_FILE'] = original
    }
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

  it('loadConfig threads commands.profile into ResolvedConfig', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
commands:
  profile: serverless
`.trimStart()
    const configPath = join(tmpDir, 'profile.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.equal(result.value.commands?.profile, 'serverless')
  })

  it('loadConfig applies default_profile when no context-level profile is set', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
default_profile: serverless
`.trimStart()
    const configPath = join(tmpDir, 'default-profile.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.equal(result.value.commands?.profile, 'serverless')
  })

  it('loadConfig profileName option overrides config profile', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
commands:
  profile: stack
`.trimStart()
    const configPath = join(tmpDir, 'profile-override.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath, profileName: 'serverless' })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.equal(result.value.commands?.profile, 'serverless')
  })

  it('loadConfig profileName option rejects unknown profile', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
`.trimStart()
    const configPath = join(tmpDir, 'profile-unknown.yml')
    await writeFile(configPath, yaml)
    // @ts-expect-error — testing runtime validation of invalid profile
    const result = await loadConfig({ configPath, profileName: 'not-a-profile' })
    assert.ok(!result.ok)
    if (result.ok) return
    assert.match(result.error.message, /Unknown profile/)
  })

  it('loadConfig per-context commands.profile overrides root commands.profile', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: key1
    commands:
      profile: stack
commands:
  profile: serverless
`.trimStart()
    const configPath = join(tmpDir, 'context-profile.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.equal(result.value.commands?.profile, 'stack')
  })
})

// ---------------------------------------------------------------------------
// Lazy validation: only resolve expressions for the active context (#144)
// ---------------------------------------------------------------------------

describe('lazy validation: inactive context expressions are not resolved', () => {
  const ACTIVE_VAR = 'ELASTIC_CLI_TEST_ACTIVE_KEY'
  const INACTIVE_VAR = 'ELASTIC_CLI_TEST_INACTIVE_KEY'
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-lazy-'))
  })
  after(async () => {
    delete process.env[ACTIVE_VAR]
    delete process.env[INACTIVE_VAR]
    await rm(tmpDir, { recursive: true })
  })

  it('succeeds when the active context resolves but an inactive context would fail', async () => {
    process.env[ACTIVE_VAR] = 'active-api-key'
    delete process.env[INACTIVE_VAR]
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ACTIVE_VAR})
  staging:
    elasticsearch:
      url: https://staging.example.com:9200
      auth:
        api_key: $(env:${INACTIVE_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'lazy-ok.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok, `expected ok, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.equal(
      (result.value.context.elasticsearch!.auth as { api_key: string }).api_key,
      'active-api-key'
    )
  })

  it('still fails when the active context has an unresolvable expression', async () => {
    delete process.env[ACTIVE_VAR]
    delete process.env[INACTIVE_VAR]
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ACTIVE_VAR})
  staging:
    elasticsearch:
      url: https://staging.example.com:9200
      auth:
        api_key: $(env:${INACTIVE_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'lazy-fail.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'expected failure for unresolvable active context expression')
    if (result.ok) return
    assert.match(result.error.message, new RegExp(ACTIVE_VAR))
  })

  it('resolves expressions in the active context selected via --use-context', async () => {
    process.env[INACTIVE_VAR] = 'staging-key'
    delete process.env[ACTIVE_VAR]
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ACTIVE_VAR})
  staging:
    elasticsearch:
      url: https://staging.example.com:9200
      auth:
        api_key: $(env:${INACTIVE_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'lazy-override.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath, contextName: 'staging' })
    assert.ok(result.ok, `expected ok with --use-context staging, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.equal(
      (result.value.context.elasticsearch!.auth as { api_key: string }).api_key,
      'staging-key'
    )
  })

  it('still validates structural config shape (missing current_context)', async () => {
    const yaml = `
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: some-key
`.trimStart()
    const configPath = join(tmpDir, 'lazy-no-current.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'should fail without current_context')
  })

  it('still validates structural config shape (empty contexts)', async () => {
    const yaml = `
current_context: local
contexts: {}
`.trimStart()
    const configPath = join(tmpDir, 'lazy-empty-contexts.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'should fail with empty contexts')
  })

  it('rejects current_context that references a nonexistent context key', async () => {
    const yaml = `
current_context: nonexistent
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: some-key
`.trimStart()
    const configPath = join(tmpDir, 'lazy-bad-ref.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'should fail when current_context references missing key')
    if (result.ok) return
    assert.ok(result.error.message.includes('nonexistent'))
  })

  it('resolves expressions in commands section', async () => {
    process.env[ACTIVE_VAR] = 'my-key'
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ACTIVE_VAR})
commands:
  allowed:
    - ping
    - elasticsearch.search
`.trimStart()
    const configPath = join(tmpDir, 'lazy-commands.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok, `expected ok, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.deepEqual(result.value.commands, { allowed: ['ping', 'elasticsearch.search'] })
  })

  it('validates active context with full schema after expression resolution', async () => {
    process.env[ACTIVE_VAR] = 'resolved-key'
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: not-a-valid-url
      auth:
        api_key: $(env:${ACTIVE_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'lazy-bad-url.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'should fail when active context has invalid URL after resolution')
  })
})

describe('security: executable config formats are rejected', () => {
  let tmpDir: string
  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-security-'))
  })
  after(async () => rm(tmpDir, { recursive: true }))

  describe('loadConfigFile rejects executable formats', () => {
    for (const ext of ['.js', '.ts', '.mjs', '.cjs']) {
      it(`throws for .elasticrc${ext}`, async () => {
        const filePath = join(tmpDir, `.elasticrc${ext}`)
        await writeFile(filePath, 'export default {}')
        await assert.rejects(
          () => loadConfigFile(filePath),
          (err: Error) => {
            assert.match(err.message, /not supported.*security/)
            return true
          }
        )
      })
    }

    it('still loads .yml files', async () => {
      const filePath = join(tmpDir, '.elasticrc.yml')
      await writeFile(filePath, VALID_CONFIG_YAML)
      const result = await loadConfigFile(filePath) as Record<string, unknown>
      assert.equal(result['current_context'], 'local')
    })

    it('still loads .json files', async () => {
      const filePath = join(tmpDir, '.elasticrc.json')
      await writeFile(filePath, JSON.stringify(VALID_CONFIG_OBJECT))
      const result = await loadConfigFile(filePath) as Record<string, unknown>
      assert.equal(result['current_context'], 'local')
    })
  })

  describe('loadConfig returns error for executable config files', () => {
    for (const ext of ['.js', '.mjs']) {
      it(`returns error for ${ext} config file`, async () => {
        const filePath = join(tmpDir, `.elasticrc${ext}`)
        await writeFile(filePath, 'export default {}')
        const result = await loadConfig({ configPath: filePath })
        assert.ok(!result.ok)
        if (result.ok) return
        assert.match(result.error.message, /not supported.*security/)
      })
    }
  })

  describe('resolveEffectiveCommands', () => {
    it('returns undefined when no policy is active', () => {
      const result = resolveEffectiveCommands(undefined, undefined, undefined, undefined)
      assert.ok(!('error' in result))
      if (!('error' in result)) assert.equal(result.commands, undefined)
    })

    it('profile override takes highest precedence', () => {
      const result = resolveEffectiveCommands(
        { profile: 'stack' },   // context says stack
        undefined,
        undefined,
        'serverless',           // --command-profile flag says serverless → wins
      )
      assert.ok(!('error' in result))
      if (!('error' in result)) assert.equal(result.commands?.profile, 'serverless')
    })

    it('context commands.profile overrides root commands.profile', () => {
      const result = resolveEffectiveCommands(
        { profile: 'stack' },
        { profile: 'serverless' },
        undefined,
        undefined,
      )
      assert.ok(!('error' in result))
      if (!('error' in result)) assert.equal(result.commands?.profile, 'stack')
    })

    it('default_profile is used as fallback when no profile elsewhere', () => {
      const result = resolveEffectiveCommands(undefined, undefined, 'serverless', undefined)
      assert.ok(!('error' in result))
      if (!('error' in result)) assert.equal(result.commands?.profile, 'serverless')
    })

    it('blocked lists from context and root are unioned', () => {
      const result = resolveEffectiveCommands(
        { blocked: ['stack.es.ml.*'] },
        { blocked: ['cloud.hosted.*'] },
        undefined,
        undefined,
      )
      assert.ok(!('error' in result))
      if (!('error' in result)) {
        assert.ok(result.commands?.blocked?.includes('stack.es.ml.*'))
        assert.ok(result.commands?.blocked?.includes('cloud.hosted.*'))
      }
    })

    it('returns error when --command-profile flag is combined with context allowed list', () => {
      const result = resolveEffectiveCommands(
        { allowed: ['stack.es.*'] },
        undefined,
        undefined,
        'serverless',
      )
      assert.ok('error' in result)
    })

    it('profile + context blocked: both are preserved', () => {
      const result = resolveEffectiveCommands(
        { profile: 'serverless', blocked: ['stack.es.ml.*'] },
        undefined,
        undefined,
        undefined,
      )
      assert.ok(!('error' in result))
      if (!('error' in result)) {
        assert.equal(result.commands?.profile, 'serverless')
        assert.deepEqual(result.commands?.blocked, ['stack.es.ml.*'])
      }
    })
  })

  describe('discoverConfigFile ignores executable file names', () => {
    for (const name of ['.elasticrc.js', '.elasticrc.ts', '.elasticrc.mjs', '.elasticrc.cjs']) {
      it(`does not discover ${name}`, async () => {
        const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-exec-'))
        await writeFile(join(dir, name), 'export default {}')
        const found = await discoverConfigFile(dir)
        assert.equal(found, null, `should not discover ${name}`)
        await rm(dir, { recursive: true })
      })
    }

    it('still discovers .elasticrc.yml', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-yml-'))
      await writeFile(join(dir, '.elasticrc.yml'), VALID_CONFIG_YAML)
      const found = await discoverConfigFile(dir)
      assert.ok(found != null)
      assert.ok(found!.endsWith('.elasticrc.yml'))
      await rm(dir, { recursive: true })
    })
  })
})
