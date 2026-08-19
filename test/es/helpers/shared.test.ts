/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  retryWithBackoff,
  runWithConcurrency,
  ProgressReporter
} from '../../../src/es/helpers/shared.ts'

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
