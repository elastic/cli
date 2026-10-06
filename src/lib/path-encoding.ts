/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that must be percent-encoded in a path segment but are NOT
 * encoded by encodeURIComponent (which follows RFC 3986 unreserved chars).
 *
 * We additionally encode `/` and `+` to prevent path traversal and avoid
 * ambiguity with legacy `application/x-www-form-urlencoded` encoding.
 */
const EXTRA_ENCODE_RE = /[!*'();:@&=+$,/?#\[\]]/g

/**
 * Percent-encodes a single path parameter value.
 *
 * encodeURIComponent handles most special chars; we additionally encode the
 * few characters it leaves unescaped that could affect URL interpretation.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(EXTRA_ENCODE_RE, (c) => {
    const code = c.charCodeAt(0).toString(16).toUpperCase()
    return `%${code.length === 1 ? '0' + code : code}`
  })
}

/**
 * Encodes a multi-target path parameter — a comma-separated list of index
 * names or aliases (e.g. `"logs-*,metrics-*"`) — by encoding each target
 * individually and rejoining with commas.
 *
 * Commas that separate targets are NOT encoded so that Elasticsearch receives
 * a proper multi-target selector.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
