/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApiKeyAuthSchema, BasicAuthSchema, AuthSchema, ServiceBlockSchema, ContextSchema, ConfigFileSchema, CommandPolicySchema } from '../../src/config/schema.ts'

const esBlock = { url: 'https://es.example.com:9200', auth: { api_key: 'key1' } }
const kibanaBlock = { url: 'https://kibana.example.com:5601', auth: { username: 'u', password: 'p' } }
const cloudBlock = { url: 'https://cloud.elastic.co/api', auth: { api_key: 'key2' } }

describe('ApiKeyAuthSchema', () => {
  it('accepts a valid api_key auth block', () => {
    const result = ApiKeyAuthSchema.safeParse({ api_key: 'abc123' })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data, { api_key: 'abc123' })
    }
  })

  it('rejects missing api_key field', () => {
    const result = ApiKeyAuthSchema.safeParse({})
    assert.equal(result.success, false)
  })

  it('rejects empty api_key string', () => {
    const result = ApiKeyAuthSchema.safeParse({ api_key: '' })
    assert.equal(result.success, false)
  })

  it('strips unknown extra fields from output', () => {
    const result = ApiKeyAuthSchema.safeParse({ api_key: 'abc123', extra: 'ignored' })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.deepEqual(result.data, { api_key: 'abc123' })
    assert.equal('extra' in result.data, false)
  })
})

describe('BasicAuthSchema', () => {
  it('accepts a valid basic auth block', () => {
    const result = BasicAuthSchema.safeParse({ username: 'admin', password: 's3cret' })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data, { username: 'admin', password: 's3cret' })
    }
  })

  it('rejects missing username field', () => {
    const result = BasicAuthSchema.safeParse({ password: 's3cret' })
    assert.equal(result.success, false)
  })

  it('rejects missing password field', () => {
    const result = BasicAuthSchema.safeParse({ username: 'admin' })
    assert.equal(result.success, false)
  })

  it('rejects empty username string', () => {
    const result = BasicAuthSchema.safeParse({ username: '', password: 's3cret' })
    assert.equal(result.success, false)
  })

  it('rejects empty password string', () => {
    const result = BasicAuthSchema.safeParse({ username: 'admin', password: '' })
    assert.equal(result.success, false)
  })

  it('strips unknown extra fields from output', () => {
    const result = BasicAuthSchema.safeParse({ username: 'admin', password: 's3cret', extra: 'ignored' })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.deepEqual(result.data, { username: 'admin', password: 's3cret' })
    assert.equal('extra' in result.data, false)
  })
})

describe('AuthSchema (inferred union)', () => {
  it('infers api_key auth from the api_key field', () => {
    const result = AuthSchema.safeParse({ api_key: 'key-xyz' })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data, { api_key: 'key-xyz' })
    }
  })

  it('infers basic auth from username and password fields', () => {
    const result = AuthSchema.safeParse({ username: 'user', password: 'pass' })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data, { username: 'user', password: 'pass' })
    }
  })

  it('rejects an object with neither api_key nor username/password', () => {
    const result = AuthSchema.safeParse({ token: 'tok' })
    assert.equal(result.success, false)
  })

  it('rejects empty object', () => {
    const result = AuthSchema.safeParse({})
    assert.equal(result.success, false)
  })
})

describe('ServiceBlockSchema', () => {
  it('accepts a valid service block with api_key auth', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'https://es.example.com:9200',
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.url, 'https://es.example.com:9200')
      assert.deepEqual(result.data.auth, { api_key: 'abc123' })
    }
  })

  it('accepts a valid service block with basic auth', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'https://kibana.example.com:5601',
      auth: { username: 'admin', password: 's3cret' },
    })
    assert.equal(result.success, true)
  })

  it('rejects missing url field', () => {
    const result = ServiceBlockSchema.safeParse({
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, false)
  })

  it('rejects empty url string', () => {
    const result = ServiceBlockSchema.safeParse({
      url: '',
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, false)
  })

  it('accepts missing auth field (no-auth mode)', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'https://es.example.com:9200',
    })
    assert.equal(result.success, true)
  })

  it('rejects auth with neither api_key nor username/password', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'https://es.example.com:9200',
      auth: { token: 'tok' },
    })
    assert.equal(result.success, false)
  })

  it('strips unknown extra fields from output', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'https://es.example.com:9200',
      auth: { api_key: 'abc123' },
      extra: 'ignored',
    })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.deepEqual(Object.keys(result.data).sort(), ['auth', 'url'])
  })

  it('rejects non-http/https URL schemes (#107)', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'ftp://es.example.com:9200',
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, false)
  })

  it('rejects non-URL strings (#107)', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'not-a-url',
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, false)
  })

  it('accepts http:// URLs (with warning at runtime)', () => {
    const result = ServiceBlockSchema.safeParse({
      url: 'http://localhost:9200',
      auth: { api_key: 'abc123' },
    })
    assert.equal(result.success, true)
  })
})

describe('ContextSchema', () => {
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
})

describe('ConfigFileSchema', () => {
  const validContexts = {
    production: { elasticsearch: esBlock },
    staging: { kibana: kibanaBlock },
  }

  it('accepts a valid config with a single context', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: { production: { elasticsearch: esBlock } },
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data['current_context'], 'production')
      assert.ok(result.data.contexts['production'] != null)
    }
  })

  it('accepts a valid config with multiple contexts', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'staging',
      contexts: validContexts,
    })
    assert.equal(result.success, true)
  })

  it('rejects missing current_context field', () => {
    const result = ConfigFileSchema.safeParse({
      contexts: { production: { elasticsearch: esBlock } },
    })
    assert.equal(result.success, false)
  })

  it('rejects missing contexts field', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
    })
    assert.equal(result.success, false)
  })

  it('rejects empty contexts map', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: {},
    })
    assert.equal(result.success, false)
  })

  it('rejects current_context referencing a nonexistent context key', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'nonexistent',
      contexts: { production: { elasticsearch: esBlock } },
    })
    assert.equal(result.success, false)
  })

  it('rejects a context value that fails ContextSchema validation', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'bad',
      contexts: { bad: {} }, // no service blocks
    })
    assert.equal(result.success, false)
  })

  it('strips unknown top-level fields from output', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: { production: { elasticsearch: esBlock } },
      extra: 'ignored',
    })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.equal('extra' in result.data, false)
  })

  it('accepts a valid commands.allowed section', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: { production: { elasticsearch: esBlock } },
      commands: { allowed: ['ping', 'elasticsearch.search'] },
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.commands?.allowed, ['ping', 'elasticsearch.search'])
    }
  })

  it('accepts a valid commands.blocked section', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: { production: { elasticsearch: esBlock } },
      commands: { blocked: ['elasticsearch.bulk'] },
    })
    assert.equal(result.success, true)
  })

  it('rejects commands with both allowed and blocked', () => {
    const result = ConfigFileSchema.safeParse({
      'current_context': 'production',
      contexts: { production: { elasticsearch: esBlock } },
      commands: { allowed: ['ping'], blocked: ['elasticsearch.bulk'] },
    })
    assert.equal(result.success, false)
  })
})
