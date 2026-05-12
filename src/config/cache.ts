/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cache for the early-loaded config result in cli.ts.
 *
 * Extracted from a bare module-level `let` in cli.ts into a dedicated module
 * so that tests can call `clearCachedConfig()` to reset state between runs,
 * preventing stale cached values from leaking across test cases.
 */

import type { LoadConfigResult } from './loader.ts'

let _cachedConfig: LoadConfigResult | undefined

/** Returns the cached config result, or `undefined` if nothing has been cached yet. */
export function getCachedConfig (): LoadConfigResult | undefined {
  return _cachedConfig
}

/** Stores a config load result in the cache. */
export function setCachedConfig (result: LoadConfigResult): void {
  _cachedConfig = result
}

/** Clears the cached config. Intended for test cleanup only. */
export function clearCachedConfig (): void {
  _cachedConfig = undefined
}
