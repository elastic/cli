/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteTopLevelAliases } from '../../src/completion/argv-aliases.ts'

describe('rewriteTopLevelAliases', () => {
  it('returns an empty array unchanged', () => {
    assert.deepEqual(rewriteTopLevelAliases([]), [])
  })

  it('prefixes "stack" before "es"', () => {
    assert.deepEqual(rewriteTopLevelAliases(['es', 'info']), ['stack', 'es', 'info'])
  })

  it('prefixes "stack" before "elasticsearch"', () => {
    assert.deepEqual(
      rewriteTopLevelAliases(['elasticsearch', 'indices', 'list']),
      ['stack', 'elasticsearch', 'indices', 'list'],
    )
  })

  it('prefixes "stack" before "kb"', () => {
    assert.deepEqual(rewriteTopLevelAliases(['kb', 'data-views']), ['stack', 'kb', 'data-views'])
  })

  it('prefixes "stack" before "kibana"', () => {
    assert.deepEqual(rewriteTopLevelAliases(['kibana', 'cases']), ['stack', 'kibana', 'cases'])
  })

  it('leaves "stack" alone (no double-prefix)', () => {
    assert.deepEqual(rewriteTopLevelAliases(['stack', 'es']), ['stack', 'es'])
  })

  it('leaves unrelated top-level commands alone', () => {
    assert.deepEqual(rewriteTopLevelAliases(['cloud', 'hosted']), ['cloud', 'hosted'])
    assert.deepEqual(rewriteTopLevelAliases(['config', 'list']), ['config', 'list'])
    assert.deepEqual(rewriteTopLevelAliases(['version']), ['version'])
  })

  it('leaves a partial first word alone (do not rewrite during typing)', () => {
    assert.deepEqual(rewriteTopLevelAliases(['e']), ['e'])
    assert.deepEqual(rewriteTopLevelAliases(['']), [''])
  })

  it('does not mutate the input array', () => {
    const input = ['es', 'info']
    const before = [...input]
    rewriteTopLevelAliases(input)
    assert.deepEqual(input, before)
  })

  it('preserves flags appearing after the alias verbatim', () => {
    assert.deepEqual(
      rewriteTopLevelAliases(['es', '--index', 'my-index', 'search']),
      ['stack', 'es', '--index', 'my-index', 'search'],
    )
  })
})
