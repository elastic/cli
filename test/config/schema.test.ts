/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ContextSchema, CommandPolicySchema } from '../../src/config/schema.ts'

const esBlock = { url: 'https://es.example.com:9200', auth: { api_key: 'key1' } }
const kibanaBlock = { url: 'https://kibana.example.com:5601', auth: { username: 'u', password: 'p' } }
const cloudBlock = { url: 'https://cloud.elastic.co/api', auth: { api_key: 'key2' } }

describe('ContextSchema', () => {
  it('drops version from the cloud block (only elasticsearch and kibana take a version hint)', () => {
    const result = ContextSchema.safeParse({ cloud: { ...cloudBlock, version: '9.2' }, elasticsearch: { ...esBlock, version: '9.2' } })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.cloud, cloudBlock)
      assert.equal(result.data.elasticsearch?.version, '9.2')
    }
  })

  it('accepts a context with only elasticsearch', () => {
    const result = ContextSchema.safeParse({ elasticsearch: esBlock })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.elasticsearch, esBlock)
      assert.equal(result.data.kibana, undefined)
      assert.equal(result.data.cloud, undefined)
    }
  })

  it('accepts a context with only kibana', () => {
    const result = ContextSchema.safeParse({ kibana: kibanaBlock })
    assert.equal(result.success, true)
  })

  it('accepts a context with only cloud', () => {
    const result = ContextSchema.safeParse({ cloud: cloudBlock })
    assert.equal(result.success, true)
  })

  it('accepts a context with all three service blocks', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      kibana: kibanaBlock,
      cloud: cloudBlock,
    })
    assert.equal(result.success, true)
  })

  it('rejects a context with no service blocks', () => {
    const result = ContextSchema.safeParse({})
    assert.equal(result.success, false)
  })

  it('rejects an invalid service block nested inside', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: { url: '', auth: { api_key: 'k' } },
    })
    assert.equal(result.success, false)
  })

  it('strips unknown extra fields from output', () => {
    const result = ContextSchema.safeParse({ elasticsearch: esBlock, extra: 'ignored' })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.equal('extra' in result.data, false)
  })

  it('keeps allow_context_override', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      allow_context_override: false,
    })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.equal(result.data.allow_context_override, false)
  })

  it('accepts a per-context commands policy', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      commands: { profile: 'serverless' },
    })
    assert.equal(result.success, true)
    if (result.success) assert.equal(result.data.commands?.profile, 'serverless')
  })

  it('accepts a per-context commands.blocked on top of a profile', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      commands: { profile: 'serverless', blocked: ['stack.es.ml.*'] },
    })
    assert.equal(result.success, true)
  })

  it('rejects per-context commands with profile + allowed', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      commands: { profile: 'serverless', allowed: ['stack.es.*'] },
    })
    assert.equal(result.success, false)
  })
})

describe('CommandPolicySchema', () => {
  it('accepts an allowed list', () => {
    const result = CommandPolicySchema.safeParse({ allowed: ['ping', 'elasticsearch.search'] })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.allowed, ['ping', 'elasticsearch.search'])
      assert.equal(result.data.blocked, undefined)
    }
  })

  it('accepts a blocked list', () => {
    const result = CommandPolicySchema.safeParse({ blocked: ['elasticsearch.bulk', 'config.set'] })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.blocked, ['elasticsearch.bulk', 'config.set'])
      assert.equal(result.data.allowed, undefined)
    }
  })

  it('accepts wildcard entries in allowed list', () => {
    const result = CommandPolicySchema.safeParse({ allowed: ['elasticsearch.*', 'ping'] })
    assert.equal(result.success, true)
  })

  it('accepts wildcard entries in blocked list', () => {
    const result = CommandPolicySchema.safeParse({ blocked: ['config.*'] })
    assert.equal(result.success, true)
  })

  it('accepts neither allowed nor blocked (no-op policy)', () => {
    const result = CommandPolicySchema.safeParse({})
    assert.equal(result.success, true)
  })

  it('rejects both allowed and blocked being present', () => {
    const result = CommandPolicySchema.safeParse({
      allowed: ['ping'],
      blocked: ['elasticsearch.bulk'],
    })
    assert.equal(result.success, false)
  })

  it('rejects an empty allowed array', () => {
    const result = CommandPolicySchema.safeParse({ allowed: [] })
    assert.equal(result.success, false)
  })

  it('rejects an empty blocked array', () => {
    const result = CommandPolicySchema.safeParse({ blocked: [] })
    assert.equal(result.success, false)
  })

  it('rejects empty strings in allowed list', () => {
    const result = CommandPolicySchema.safeParse({ allowed: ['ping', ''] })
    assert.equal(result.success, false)
  })

  it('rejects empty strings in blocked list', () => {
    const result = CommandPolicySchema.safeParse({ blocked: [''] })
    assert.equal(result.success, false)
  })

  it('accepts a valid profile name alone', () => {
    for (const profile of ['serverless', 'stack', 'default'] as const) {
      const result = CommandPolicySchema.safeParse({ profile })
      assert.equal(result.success, true, `expected profile "${profile}" to be accepted`)
      if (result.success) assert.equal(result.data.profile, profile)
    }
  })

  it('accepts profile + blocked (composition)', () => {
    const result = CommandPolicySchema.safeParse({ profile: 'serverless', blocked: ['stack.es.ml.*'] })
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.profile, 'serverless')
      assert.deepEqual(result.data.blocked, ['stack.es.ml.*'])
    }
  })

  it('rejects profile + allowed (mutually exclusive)', () => {
    const result = CommandPolicySchema.safeParse({ profile: 'serverless', allowed: ['stack.es.*'] })
    assert.equal(result.success, false)
    if (result.success) return
    assert.deepEqual(result.errors, [{ path: '', message: '"profile" and "allowed" are mutually exclusive' }])
  })

  it('reports allowed + blocked as mutually exclusive', () => {
    const result = CommandPolicySchema.safeParse({ allowed: ['ping'], blocked: ['config.*'] })
    assert.equal(result.success, false)
    if (result.success) return
    assert.deepEqual(result.errors, [{ path: '', message: '"allowed" and "blocked" are mutually exclusive' }])
  })

  it('reports nested commands mutual exclusion at the commands path', () => {
    const result = ContextSchema.safeParse({
      elasticsearch: esBlock,
      commands: { allowed: ['ping'], blocked: ['config.*'] },
    })
    assert.equal(result.success, false)
    if (result.success) return
    assert.deepEqual(result.errors, [{ path: '.commands', message: '"allowed" and "blocked" are mutually exclusive' }])
  })

  it('rejects an unknown profile name', () => {
    const result = CommandPolicySchema.safeParse({ profile: 'unknown-profile' })
    assert.equal(result.success, false)
  })
})

describe('ContextSchema — service block validation', () => {
  const url = 'https://es.example.com:9200'
  const es = (block: Record<string, unknown>) => ContextSchema.safeParse({ elasticsearch: block })

  it('accepts api_key and basic auth', () => {
    const apiKey = es({ url, auth: { api_key: 'abc123' } })
    assert.equal(apiKey.success, true)
    if (apiKey.success) assert.deepEqual(apiKey.data.elasticsearch?.auth, { api_key: 'abc123' })
    const basic = es({ url, auth: { username: 'admin', password: 's3cret' } })
    assert.equal(basic.success, true)
    if (basic.success) assert.deepEqual(basic.data.elasticsearch?.auth, { username: 'admin', password: 's3cret' })
  })

  it('accepts a block with no auth (no-auth mode)', () => {
    assert.equal(es({ url }).success, true)
  })

  it('rejects missing or empty url', () => {
    assert.equal(es({ auth: { api_key: 'k' } }).success, false)
    assert.equal(es({ url: '', auth: { api_key: 'k' } }).success, false)
  })

  it('rejects auth that is neither api_key nor username+password', () => {
    for (const auth of [{ token: 'tok' }, {}, { api_key: '' }, { username: 'admin' }, { password: 'p' }, { username: '', password: 'p' }, { username: 'u', password: '' }]) {
      assert.equal(es({ url, auth }).success, false, JSON.stringify(auth))
    }
  })

  it('strips unknown fields from the block and its auth', () => {
    const result = es({ url, auth: { api_key: 'k', extra: 1 }, extra: 'ignored' })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.deepEqual(result.data.elasticsearch, { url, auth: { api_key: 'k' } })
  })

  it('rejects non-http/https URL schemes and non-URL strings (#107)', () => {
    assert.equal(es({ url: 'ftp://es.example.com:9200' }).success, false)
    assert.equal(es({ url: 'not-a-url' }).success, false)
  })

  it('accepts http:// URLs (with warning at runtime)', () => {
    assert.equal(es({ url: 'http://localhost:9200' }).success, true)
  })

  it('names the offending field when a URL matches ^https?:// but is unparseable', () => {
    const result = ContextSchema.safeParse({ kibana: { url: 'http://' } })
    assert.equal(result.success, false)
    if (result.success) return
    assert.deepEqual(result.errors, [{ path: '.kibana.url', message: 'must be a valid URL' }])
  })

  for (const version of ['9.2', '9.2.3', 'serverless']) {
    it(`accepts version "${version}"`, () => {
      const result = es({ url, version })
      assert.equal(result.success, true)
      if (result.success) assert.equal(result.data.elasticsearch?.version, version)
    })
  }

  it('preserves version on the kibana block', () => {
    const result = ContextSchema.safeParse({ kibana: { url: 'https://kb.example.com:5601', version: '9.2.1' } })
    assert.equal(result.success, true)
    if (result.success) assert.equal(result.data.kibana?.version, '9.2.1')
  })

  for (const version of ['foo', '9', 'v9.2', '9.2.3.4']) {
    it(`rejects version "${version}" at the version path`, () => {
      const result = es({ url, version })
      assert.equal(result.success, false)
      if (result.success) return
      assert.ok(result.errors.some(e => e.path === '.elasticsearch.version'))
    })
  }

  it('rejects empty version', () => {
    assert.equal(es({ url, version: '' }).success, false)
  })

  it('leaves version undefined when absent', () => {
    const result = es({ url, auth: { api_key: 'k' } })
    assert.equal(result.success, true)
    if (result.success) assert.equal(result.data.elasticsearch?.version, undefined)
  })
})
