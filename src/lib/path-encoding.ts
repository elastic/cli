/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path. Uses `encodeURIComponent` as the base (which encodes everything except
 * `A-Z a-z 0-9 - _ . ! ~ * ' ( )`) and additionally encodes `!`, `'`, `(`,
 * `)`, and `*` which are technically allowed but can be ambiguous.
 *
 * Does NOT encode `/` because callers are responsible for splitting on `/`
 * before calling this function.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
