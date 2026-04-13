/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInput,
  buildBulkNdjsonBody,
  retryWithBackoff,
  runWithConcurrency,
  ProgressReporter
} from '../../../src/es/helpers/shared.ts'

describe('parseInput', () => {
  it('parses a JSON array', () => {
    const result = parseInput('[{"a":1},{"b":2}]')
    assert.deepStrictEqual(result, [{ a: 1 }, { b: 2 }])
  })

  it('parses NDJSON', () => {
    const result = parseInput('{"a":1}\n{"b":2}\n')
    assert.deepStrictEqual(result, [{ a: 1 }, { b: 2 }])
  })

  it('skips empty lines in NDJSON', () => {
    const result = parseInput('{"a":1}\n\n{"b":2}\n\n')
    assert.deepStrictEqual(result, [{ a: 1 }, { b: 2 }])
  })

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(parseInput(''), [])
    assert.deepStrictEqual(parseInput('  \n  '), [])
  })

  it('parses a single JSON object as NDJSON', () => {
    const result = parseInput('{"a":1}')
    assert.deepStrictEqual(result, [{ a: 1 }])
  })

  it('throws on malformed NDJSON line', () => {
    assert.throws(() => parseInput('{"a":1}\nnot json\n'), /Failed to parse NDJSON at line 2/)
  })

  it('handles JSON array with whitespace', () => {
    const result = parseInput('  \n  [{"a":1}]  \n  ')
    assert.deepStrictEqual(result, [{ a: 1 }])
  })
})

describe('buildBulkNdjsonBody', () => {
  it('wraps documents in index actions', () => {
    const body = buildBulkNdjsonBody([{ title: 'doc1' }, { title: 'doc2' }], { index: 'my-index' })
    const lines = body.split('\n')
    assert.equal(lines.length, 5) // 4 content lines + trailing empty line
    assert.deepStrictEqual(JSON.parse(lines[0]), { index: { _index: 'my-index' } })
    assert.deepStrictEqual(JSON.parse(lines[1]), { title: 'doc1' })
    assert.deepStrictEqual(JSON.parse(lines[2]), { index: { _index: 'my-index' } })
    assert.deepStrictEqual(JSON.parse(lines[3]), { title: 'doc2' })
    assert.equal(lines[4], '') // trailing newline
  })

  it('includes pipeline and routing in action metadata', () => {
    const body = buildBulkNdjsonBody([{ a: 1 }], {
      index: 'idx',
      pipeline: 'my-pipe',
      routing: 'shard-1'
    })
    const action = JSON.parse(body.split('\n')[0])
    assert.deepStrictEqual(action, {
      index: { _index: 'idx', pipeline: 'my-pipe', routing: 'shard-1' }
    })
  })

  it('returns trailing newline for empty docs', () => {
    const body = buildBulkNdjsonBody([], { index: 'idx' })
    assert.equal(body, '\n')
  })

  it('omits undefined metadata fields', () => {
    const body = buildBulkNdjsonBody([{ a: 1 }], {})
    const action = JSON.parse(body.split('\n')[0])
    assert.deepStrictEqual(action, { index: {} })
  })
})

describe('retryWithBackoff', () => {
  it('returns result on first success', async () => {
    const result = await retryWithBackoff(() => Promise.resolve(42), { retries: 3, delay: 1 })
    assert.equal(result, 42)
  })

  it('retries and succeeds', async () => {
    let attempt = 0
    const result = await retryWithBackoff(() => {
      attempt++
      if (attempt < 3) throw new Error('fail')
      return Promise.resolve('ok')
    }, { retries: 3, delay: 1 })
    assert.equal(result, 'ok')
    assert.equal(attempt, 3)
  })

  it('throws after exhausting retries', async () => {
    await assert.rejects(
      () => retryWithBackoff(() => Promise.reject(new Error('always fail')), { retries: 2, delay: 1 }),
      { message: 'always fail' }
    )
  })

  it('retries zero times when retries is 0', async () => {
    let attempt = 0
    await assert.rejects(() => retryWithBackoff(() => {
      attempt++
      return Promise.reject(new Error('fail'))
    }, { retries: 0, delay: 1 }))
    assert.equal(attempt, 1)
  })
})

describe('runWithConcurrency', () => {
  it('processes all items and preserves order', async () => {
    const results = await runWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (item) => item * 10
    )
    assert.deepStrictEqual(results, [10, 20, 30, 40, 50])
  })

  it('limits concurrency', async () => {
    let active = 0
    let maxActive = 0
    const results = await runWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (item) => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        return item
      }
    )
    assert.deepStrictEqual(results, [1, 2, 3, 4])
    assert.ok(maxActive <= 2, `max concurrency was ${maxActive}, expected <= 2`)
  })

  it('handles empty input', async () => {
    const results = await runWithConcurrency([], 5, async () => 'x')
    assert.deepStrictEqual(results, [])
  })
})

describe('ProgressReporter', () => {
  it('tracks counts correctly', () => {
    const reporter = new ProgressReporter()
    reporter.report(100, 5)
    reporter.report(50, 0)
    assert.equal(reporter.total, 150)
    assert.equal(reporter.succeeded, 145)
    assert.equal(reporter.failed, 5)
  })

  it('summary includes elapsed_ms', () => {
    const reporter = new ProgressReporter()
    reporter.report(10, 1)
    reporter.retries = 2
    const summary = reporter.summary() as Record<string, unknown>
    assert.equal(summary.total, 10)
    assert.equal(summary.succeeded, 9)
    assert.equal(summary.failed, 1)
    assert.equal(summary.retries, 2)
    assert.equal(typeof summary.elapsed_ms, 'number')
  })

  it('summary includes files_processed when non-zero', () => {
    const reporter = new ProgressReporter()
    reporter.filesProcessed = 3
    reporter.report(10, 0)
    const summary = reporter.summary() as Record<string, unknown>
    assert.equal(summary.files_processed, 3)
  })

  it('summary omits files_processed when zero', () => {
    const reporter = new ProgressReporter()
    reporter.report(10, 0)
    const summary = reporter.summary() as Record<string, unknown>
    assert.equal(summary.files_processed, undefined)
  })
})
