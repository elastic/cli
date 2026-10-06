/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that must be percent-encoded in an Elasticsearch path segment.
 * We encode everything that encodeURIComponent encodes PLUS the slash, which
 * encodeURIComponent leaves decoded.
 */
const SAFE = /[A-Za-z0-9\-._~!$&'()*+,;=:@]/

/**
 * Percent-encodes a single path parameter value so it is safe to embed in a
 * URL path segment. Encodes everything except unreserved and sub-delimiter
 * characters (RFC 3986).
 */
export function encodePathParam (value: string): string {
  return value
    .split('')
    .map((ch) => {
      if (SAFE.test(ch)) return ch
      return encodeURIComponent(ch)
    })
    .join('')
}

/**
 * Encodes a multi-target path parameter (e.g. an index pattern like
 * `my-index,other-index,*` or a data-stream name). Comma-separated targets
 * are each encoded individually so commas acting as separators are preserved
 * while any literal commas inside a target name are encoded.
 *
 * Asterisks (`*`) are preserved unencoded because they are valid Elasticsearch
 * wildcard characters in index names.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) =>
      target
        .split('')
        .map((ch) => {
          if (ch === '*') return ch
          if (SAFE.test(ch)) return ch
          return encodeURIComponent(ch)
        })
        .join('')
    )
    .join(',')
}
