/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildContextEnv } from '../../src/extension/context.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

describe('buildContextEnv', () => {
  it('exports url and api key for each configured service', () => {
    const env = buildContextEnv({
      context: {
        elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'es-key' } },
        kibana: { url: 'http://localhost:5601', auth: { api_key: 'kb-key' } },
        cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'cloud-key' } },
      },
    } as ResolvedConfig)

    assert.equal(env['ELASTIC_ES_URL'], 'http://localhost:9200')
    assert.equal(env['ELASTIC_ES_API_KEY'], 'es-key')
    assert.equal(env['ELASTIC_KIBANA_URL'], 'http://localhost:5601')
    assert.equal(env['ELASTIC_KIBANA_API_KEY'], 'kb-key')
    assert.equal(env['ELASTIC_CLOUD_URL'], 'https://api.elastic-cloud.com')
    assert.equal(env['ELASTIC_CLOUD_API_KEY'], 'cloud-key')
  })

  it('exports basic auth credentials', () => {
    const env = buildContextEnv({
      context: { elasticsearch: { url: 'http://localhost:9200', auth: { username: 'u', password: 'p' } } },
    } as ResolvedConfig)

    assert.equal(env['ELASTIC_ES_USERNAME'], 'u')
    assert.equal(env['ELASTIC_ES_PASSWORD'], 'p')
    assert.equal(env['ELASTIC_ES_API_KEY'], undefined)
  })

  it('omits credentials when a service has no auth', () => {
    const env = buildContextEnv({
      context: { kibana: { url: 'http://localhost:5601' } },
    } as ResolvedConfig)

    assert.deepEqual(Object.keys(env), ['ELASTIC_KIBANA_URL'])
  })

  it('omits ES variables for a via-kibana context', () => {
    // There is no Elasticsearch endpoint to hand over: an extension has to go through
    // Kibana, so only the Kibana variables are exported.
    const env = buildContextEnv({
      context: {
        elasticsearch: { via: 'kibana' },
        kibana: { url: 'https://kibana.example', auth: { api_key: 'kb-key' } },
      },
    } as ResolvedConfig)

    assert.equal(env['ELASTIC_ES_URL'], undefined)
    assert.equal(env['ELASTIC_ES_API_KEY'], undefined)
    assert.equal(env['ELASTIC_KIBANA_URL'], 'https://kibana.example')
    assert.equal(env['ELASTIC_KIBANA_API_KEY'], 'kb-key')
  })

  it('returns an empty map for a context with no services', () => {
    assert.deepEqual(buildContextEnv({ context: {} } as ResolvedConfig), {})
  })
})
