/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path segment value for safe use in a URL path.
 *
 * Uses encodeURIComponent as the baseline (encodes everything except
 * A-Z a-z 0-9 - _ . ! ~ * ' ( )) then additionally encodes characters
 * that are technically allowed by encodeURIComponent but have special
 * meaning inside path segments: '!' '\'' '(' ')' '*' and '~' are left
 * as-is by encodeURIComponent but are harmless in path segments, so we
 * keep the standard encodeURIComponent output.
 *
 * This intentionally does NOT preserve slashes — callers must split on
 * '/' before calling this function.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
