/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path without being interpreted as a path separator or traversal sequence.
 *
 * Uses `encodeURIComponent` as the base (which encodes everything except
 * `A-Z a-z 0-9 - _ . ! ~ * ' ( )`) and additionally encodes the characters
 * that `encodeURIComponent` leaves unencoded but that can be significant:
 * `!`, `'`, `(`, `)`, `*`, and `~`.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
}
