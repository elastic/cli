/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure decision helpers for the A/B perf gate, split out so the statistical
// boundary and retry logic can be unit tested without invoking hyperfine.

/** Relative measurement noise of one hyperfine result: stddev as a fraction of the mean. */
export function relNoise (result) {
  return result.stddev / result.mean
}

/**
 * True if any sample is noisier than `threshold` (relative stddev), meaning the
 * A/B comparison should re-run the command once before trusting it.
 */
export function isNoisy (results, threshold) {
  return results.some((r) => relNoise(r) > threshold)
}

/**
 * Decide whether `pr` is confidently slower than `base`. Returns true only when
 * the slowdown exceeds `regressionPct` AND clears `confidenceK` combined
 * standard deviations, so a lone noisy spike cannot trip the gate. `pr` is the
 * numerator: callers must pass the PR result first and the base result second.
 */
export function isRegression (pr, base, { regressionPct, confidenceK }) {
  const ratio = pr.mean / base.mean
  // Combined relative noise of the ratio; independent errors add in quadrature.
  const combinedRel = Math.hypot(relNoise(pr), relNoise(base))
  return (ratio - confidenceK * combinedRel) > (1 + regressionPct)
}
