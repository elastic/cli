/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import {
  writeConfig,
  readRawConfig,
  upsertContext,
  removeContext,
  setCurrentContext,
  extractContext,
  emptyConfig,
  serializeConfig,
  type RawConfig,
} from '../../src/config/writer.ts'

const SAMPLE: RawConfig = {
  current_context: 'local',
  contexts: {
    local: {
      elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'k1' } },
    },
    staging: {
      elasticsearch: { url: 'https://staging.example.com:9200', auth: { api_key: 'k2' } },
    },
  },
}

describe('upsertContext', () => {
  it('adds a new context without mutating the input', () => {
    const next = upsertContext(SAMPLE, 'prod', {
      elasticsearch: { url: 'https://prod.example.com:9200', auth: { api_key: 'k3' } },
    })
    assert.ok('prod' in next.contexts)
    assert.ok(!('prod' in SAMPLE.contexts))
    assert.notEqual(next, SAMPLE)
    assert.notEqual(next.contexts, SAMPLE.contexts)
  })

  it('overwrites an existing context', () => {
    const next = upsertContext(SAMPLE, 'local', {
      kibana: { url: 'http://other:5601' },
    })
    assert.deepEqual(next.contexts.local, { kibana: { url: 'http://other:5601' } })
    assert.deepEqual(SAMPLE.contexts.local, {
      elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'k1' } },
    })
  })
})

describe('removeContext', () => {
  it('removes a non-current context', () => {
    const next = removeContext(SAMPLE, 'staging')
    assert.ok(!('staging' in next.contexts))
    assert.equal(next.current_context, 'local')
  })

  it('clears current_context when removing the active context', () => {
    const next = removeContext(SAMPLE, 'local')
    assert.ok(!('local' in next.contexts))
    assert.equal(next.current_context, '')
  })

  it('returns the same config when removing a missing context', () => {
    const next = removeContext(SAMPLE, 'nonexistent')
    assert.equal(next, SAMPLE)
  })
})

describe('setCurrentContext', () => {
  it('updates current_context when the name exists', () => {
    const next = setCurrentContext(SAMPLE, 'staging')
    assert.equal(next.current_context, 'staging')
    assert.equal(SAMPLE.current_context, 'local')
  })

  it('throws when the name does not exist', () => {
    assert.throws(() => setCurrentContext(SAMPLE, 'prod'), /not found/)
  })
})

describe('extractContext', () => {
  it('returns the named context', () => {
    assert.deepEqual(extractContext(SAMPLE, 'local'), SAMPLE.contexts.local)
  })

  it('throws when the name does not exist', () => {
    assert.throws(() => extractContext(SAMPLE, 'prod'), /not found/)
  })
})

describe('serializeConfig', () => {
  it('emits current_context before contexts for stable diffs', () => {
    const yaml = serializeConfig(SAMPLE)
    assert.ok(yaml.indexOf('current_context') < yaml.indexOf('contexts'))
  })

  it('preserves $(...) resolver expressions as plain strings', () => {
    const cfg: RawConfig = {
      current_context: 'x',
      contexts: {
        x: { elasticsearch: { url: 'https://e:9200', auth: { api_key: '$(keychain:elastic-cli/x:es.api_key)' } } },
      },
    }
    const yaml = serializeConfig(cfg)
    assert.match(yaml, /\$\(keychain:elastic-cli\/x:es\.api_key\)/)
    // round-trip
    const parsed = parseYaml(yaml) as RawConfig
    assert.equal(
      (parsed.contexts.x as { elasticsearch: { auth: { api_key: string } } }).elasticsearch.auth.api_key,
      '$(keychain:elastic-cli/x:es.api_key)'
    )
  })
})

describe('writeConfig', () => {
  let dir: string
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'elastic-cli-writer-')) })
  after(async () => rm(dir, { recursive: true, force: true }))

  it('writes a YAML file at the given path', async () => {
    const path = join(dir, 'basic.yml')
    const result = await writeConfig(path, SAMPLE)
    assert.equal(result.path, path)
    const content = await readFile(path, 'utf-8')
    const parsed = parseYaml(content) as RawConfig
    assert.equal(parsed.current_context, 'local')
    assert.ok('staging' in parsed.contexts)
  })

  it('enforces 0600 permissions on Unix', async () => {
    if (process.platform === 'win32') return
    const path = join(dir, 'perms.yml')
    const result = await writeConfig(path, SAMPLE)
    assert.equal(result.permsEnforced, true)
    const st = await stat(path)
    assert.equal(st.mode & 0o777, 0o600)
    assert.deepEqual(result.warnings, [])
  })

  it('creates parent directories by default', async () => {
    const path = join(dir, 'nested', 'deeper', 'cfg.yml')
    await writeConfig(path, SAMPLE)
    const st = await stat(path)
    assert.ok(st.isFile())
  })

  it('round-trips via readRawConfig', async () => {
    const path = join(dir, 'roundtrip.yml')
    await writeConfig(path, SAMPLE)
    const raw = await readRawConfig(path)
    assert.equal(raw.current_context, SAMPLE.current_context)
    assert.deepEqual(Object.keys(raw.contexts).sort(), ['local', 'staging'])
  })

  it('leaves no .tmp file on success', async () => {
    const path = join(dir, 'tmp.yml')
    await writeConfig(path, SAMPLE)
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(dir)
    assert.ok(!entries.some(e => e.includes('.tmp')), `unexpected tmp files: ${entries.join(', ')}`)
  })

  it('can write a config with empty contexts (caller owns validity)', async () => {
    const path = join(dir, 'empty.yml')
    await writeConfig(path, emptyConfig())
    const raw = await readRawConfig(path)
    assert.deepEqual(raw.contexts, {})
  })
})

describe('readRawConfig', () => {
  let dir: string
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'elastic-cli-reader-')) })
  after(async () => rm(dir, { recursive: true, force: true }))

  it('returns emptyConfig when the file does not exist', async () => {
    const raw = await readRawConfig(join(dir, 'missing.yml'))
    assert.deepEqual(raw, emptyConfig())
  })

  it('returns emptyConfig on a file with null content', async () => {
    const path = join(dir, 'null.yml')
    await writeFile(path, '')
    const raw = await readRawConfig(path)
    assert.deepEqual(raw, emptyConfig())
  })

  it('preserves the commands section when present', async () => {
    const path = join(dir, 'with-commands.yml')
    await writeConfig(path, {
      ...SAMPLE,
      commands: { allowed: ['cloud.*'] },
    })
    const raw = await readRawConfig(path)
    assert.deepEqual(raw.commands, { allowed: ['cloud.*'] })
  })
})
