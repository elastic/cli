/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path. Uses `encodeURIComponent` which encodes all characters except
 * `A-Z a-z 0-9 - _ . ! ~ * ' ( )`, then additionally encodes `!`, `'`, `(`,
 * `)`, and `*` which are technically sub-delimiters that some servers may
 * misinterpret when left unencoded in a path segment.
 *
 * Does NOT encode the `/` separator (callers must not pass multi-segment
 * strings here; each segment should be encoded individually).
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
