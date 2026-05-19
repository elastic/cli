/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import lzString from 'lz-string'
const { decompressFromBase64 } = lzString
import { buildPreviewUrl, createEsqlPreviewUrlCommand } from '../../../src/kb/helpers/esql-preview-url.ts'
import { Command } from 'commander'

function decodeParams (url: string): Record<string, unknown> {
  const lzParam = new URL(url).searchParams.get('lz')
  assert.ok(lzParam != null, 'lz param missing from URL')
  const json = decompressFromBase64(decodeURIComponent(lzParam))
  assert.ok(json != null, 'failed to decompress lz param')
  return JSON.parse(json) as Record<string, unknown>
}

describe('buildPreviewUrl', () => {
  it('returns a URL with the correct base and locator params', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now')
    assert.ok(url.startsWith('http://kibana:5601/app/r?l=DISCOVER_APP_LOCATOR&v=9.1.0&lz='))
  })

  it('embeds the query in compressed params', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now')
    const params = decodeParams(url)
    assert.deepEqual(params.query, { esql: 'FROM logs-* | LIMIT 100' })
  })

  it('sets the time range', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-1h', 'now')
    const params = decodeParams(url)
    assert.deepEqual(params.timeRange, { from: 'now-1h', to: 'now' })
  })

  it('sets tab to id=new', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now')
    const params = decodeParams(url)
    assert.deepEqual(params.tab, { id: 'new', label: 'ES|QL preview' })
  })

  it('derives dataViewSpec title from the FROM clause', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now')
    const params = decodeParams(url)
    assert.deepEqual(params.dataViewSpec, { title: 'logs-*' })
  })

  it('omits dataViewSpec when query has no FROM clause', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'ROW x = 1', 'now-15m', 'now')
    const params = decodeParams(url)
    assert.equal(params.dataViewSpec, undefined)
  })

  it('includes columns when provided', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now', ['@timestamp', 'message'])
    const params = decodeParams(url)
    assert.deepEqual(params.columns, ['@timestamp', 'message'])
  })

  it('omits columns when not provided', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now')
    const params = decodeParams(url)
    assert.equal(params.columns, undefined)
  })

  it('omits columns when given an empty array', () => {
    const url = buildPreviewUrl('http://kibana:5601', 'FROM logs-* | LIMIT 100', 'now-15m', 'now', [])
    const params = decodeParams(url)
    assert.equal(params.columns, undefined)
  })
})

describe('createEsqlPreviewUrlCommand', () => {
  it('returns a Command named preview-url', () => {
    const cmd = createEsqlPreviewUrlCommand()
    assert.ok(cmd instanceof Command)
    assert.equal(cmd.name(), 'preview-url')
  })

  it('has a description', () => {
    const cmd = createEsqlPreviewUrlCommand()
    assert.ok(cmd.description().length > 0)
  })
})
