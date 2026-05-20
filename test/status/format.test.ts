/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatusText } from '../../src/status/format.ts'

describe('formatStatusText', () => {
  it('renders the issue mock layout for all three services', () => {
    const out = formatStatusText({
      context: 'local',
      services: {
        elasticsearch: { ok: true, url: 'http://localhost:9200', status: 'green', nodes: 3 },
        kibana: { ok: true, url: 'http://localhost:5601', status: 'available', version: '8.18.0' },
        cloud: { ok: false, url: 'https://api.elastic-cloud.com', error: 'auth failed (401)' },
      },
    })
    assert.equal(
      out,
      [
        'Context: local',
        '',
        '  Elasticsearch  http://localhost:9200          ✓  green (3 nodes)',
        '  Kibana         http://localhost:5601          ✓  available (8.18.0)',
        '  Cloud          https://api.elastic-cloud.com  ✗  auth failed (401)',
        '',
      ].join('\n')
    )
  })

  it('omits services missing from the context', () => {
    const out = formatStatusText({
      context: 'es-only',
      services: {
        elasticsearch: { ok: true, url: 'http://localhost:9200', status: 'green', nodes: 1 },
      },
    })
    assert.ok(out.startsWith('Context: es-only\n\n'), `got ${out}`)
    assert.ok(out.includes('Elasticsearch  http://localhost:9200  ✓  green (1 node)'))
    assert.ok(!out.includes('Kibana'))
    assert.ok(!out.includes('Cloud'))
  })

  it('pluralises the node count correctly', () => {
    const one = formatStatusText({
      context: 'c',
      services: { elasticsearch: { ok: true, url: 'u', status: 'green', nodes: 1 } },
    })
    assert.ok(one.includes('1 node)'), `got ${one}`)
    assert.ok(!one.includes('1 nodes)'))

    const many = formatStatusText({
      context: 'c',
      services: { elasticsearch: { ok: true, url: 'u', status: 'green', nodes: 5 } },
    })
    assert.ok(many.includes('5 nodes)'), `got ${many}`)
  })

  it('renders failed services with their classified error message', () => {
    const out = formatStatusText({
      context: 'local',
      services: {
        elasticsearch: { ok: false, url: 'http://es', error: 'network error: ECONNREFUSED' },
      },
    })
    assert.ok(out.includes('✗  network error: ECONNREFUSED'), `got ${out}`)
  })

  it('returns just the header when no services are configured', () => {
    const out = formatStatusText({ context: 'empty', services: {} })
    assert.equal(out, 'Context: empty\n\n')
  })

  it('pads the URL column to the widest URL', () => {
    const out = formatStatusText({
      context: 'c',
      services: {
        elasticsearch: { ok: true, url: 'http://es', status: 'green', nodes: 1 },
        kibana: { ok: true, url: 'http://kibana-very-long-url.example.com', status: 'available', version: '9' },
      },
    })
    const lines = out.split('\n')
    const esLine = lines.find((l) => l.includes('Elasticsearch'))!
    const kbLine = lines.find((l) => l.includes('Kibana'))!
    // Glyph column must align between rows
    assert.equal(esLine.indexOf('✓'), kbLine.indexOf('✓'))
  })

  it('renders cloud success as "available"', () => {
    const out = formatStatusText({
      context: 'c',
      services: { cloud: { ok: true, url: 'https://cloud' } },
    })
    assert.ok(out.includes('✓  available'), `got ${out}`)
  })
})
