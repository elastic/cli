/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isNoisy, isRegression, relNoise } from '../../scripts/perf-check-lib.mjs'

const GATE = { regressionPct: 0.15, confidenceK: 2 }

describe('relNoise', () => {
  it('reports stddev as a fraction of the mean', () => {
    assert.equal(relNoise({ mean: 100, stddev: 5 }), 0.05)
  })
})

describe('isNoisy', () => {
  it('is true when any sample exceeds the threshold', () => {
    const results = [{ mean: 100, stddev: 5 }, { mean: 100, stddev: 20 }]
    assert.equal(isNoisy(results, 0.1), true)
  })

  it('is false when every sample is within the threshold', () => {
    const results = [{ mean: 100, stddev: 5 }, { mean: 100, stddev: 9 }]
    assert.equal(isNoisy(results, 0.1), false)
  })

  it('treats the threshold as exclusive', () => {
    assert.equal(isNoisy([{ mean: 100, stddev: 10 }], 0.1), false)
  })
})

describe('isRegression', () => {
  it('flags a clean slowdown beyond the percentage gate', () => {
    // PR 25% slower, no noise: clears 15% with margin to spare.
    const pr = { mean: 125, stddev: 0 }
    const base = { mean: 100, stddev: 0 }
    assert.equal(isRegression(pr, base, GATE), true)
  })

  it('does not flag a slowdown smaller than the percentage gate', () => {
    const pr = { mean: 110, stddev: 0 }
    const base = { mean: 100, stddev: 0 }
    assert.equal(isRegression(pr, base, GATE), false)
  })

  it('does not flag a large but noisy slowdown', () => {
    // 25% slower, but combined noise swamps the 2-sigma confidence band.
    const pr = { mean: 125, stddev: 25 }
    const base = { mean: 100, stddev: 20 }
    assert.equal(isRegression(pr, base, GATE), false)
  })

  it('treats pr as the numerator, so a faster PR never regresses', () => {
    const pr = { mean: 80, stddev: 0 }
    const base = { mean: 100, stddev: 0 }
    assert.equal(isRegression(pr, base, GATE), false)
    // Swapping the arguments would (wrongly) read as a 25% regression.
    assert.equal(isRegression(base, pr, GATE), true)
  })

  it('requires the slowdown to clear K combined standard deviations', () => {
    // 20% slower with just enough noise to sit on the confidence boundary.
    // ratio 1.20, regressionPct 0.15 -> need (1.20 - 2*rel) > 1.15 -> rel < 0.025.
    const base = { mean: 100, stddev: 0 }
    assert.equal(isRegression({ mean: 120, stddev: 120 * 0.02 }, base, GATE), true)
    assert.equal(isRegression({ mean: 120, stddev: 120 * 0.03 }, base, GATE), false)
  })
})
