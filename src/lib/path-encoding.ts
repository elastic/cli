/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that are safe to leave unencoded inside a single path segment.
 * RFC 3986 unreserved chars plus the subset of sub-delimiters that
 * Elasticsearch accepts in index/alias names.
 */
const SAFE = /[A-Za-z0-9\-._~!$&'()*+,;=@]/

/**
 * Percent-encode a single path parameter value.
 *
 * Every character that is not in the RFC 3986 unreserved set or a small set
 * of sub-delimiters is percent-encoded. In particular `/` and `?` are always
 * encoded so a caller cannot inject extra path segments or a query string.
 */
export function encodePathParam (value: string): string {
  let out = ''
  for (const char of value) {
    if (SAFE.test(char)) {
      out += char
    } else {
      const bytes = new TextEncoder().encode(char)
      for (const byte of bytes) {
        out += '%' + byte.toString(16).toUpperCase().padStart(2, '0')
      }
    }
  }
  return out
}

/**
 * Encode a multi-target path parameter (comma-separated list of index names,
 * aliases, data-stream names, or wildcard expressions).
 *
 * Each individual target is encoded with `encodePathParam` so that special
 * characters within a name are safely escaped, but the comma separators and
 * `*` wildcard characters are preserved so that Elasticsearch receives them
 * as intended.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => {
      // Preserve leading `-` (exclusion prefix) and encode the rest.
      // Wildcards (`*`, `?`) are valid Elasticsearch name characters and must
      // not be percent-encoded so patterns like `logs-*` continue to work.
      const trimmed = target.trim()
      if (trimmed === '') return trimmed
      return trimmed
        .split('*')
        .map((part) =>
          part
            .split('?')
            .map((segment) => encodePathParam(segment))
            .join('?')
        )
        .join('*')
    })
    .join(',')
}
