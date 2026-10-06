/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value so it is safe to embed in a
 * URL path segment. Characters that are valid in a path segment per RFC 3986
 * but could alter routing (e.g. `/`) are encoded.
 *
 * Rejects empty strings, `.`, and `..` because a URL-normalizing proxy would
 * collapse them and potentially widen the request scope to the resource root.
 */
export function encodePathParam (value: string): string {
  if (value === '') {
    throw Object.assign(
      new Error('Invalid path parameter: empty string would widen the request scope instead of targeting a specific resource'),
      { code: 'input_error' }
    )
  }
  if (value === '.' || value === '..') {
    throw Object.assign(
      new Error(`Invalid path parameter: value "${value}" resolves to the parent/root resource instead of a specific target`),
      { code: 'input_error' }
    )
  }
  // encodeURIComponent encodes everything except: A-Z a-z 0-9 - _ . ! ~ * ' ( )
  return encodeURIComponent(value)
}

/**
 * Encodes a comma-separated multi-target string (e.g. `index1,index2,-index3`).
 * Each individual target is encoded with `encodePathParam`; commas and leading
 * minus signs are preserved so Elasticsearch multi-target syntax is respected.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => {
      const trimmed = target.trim()
      if (trimmed.startsWith('-')) {
        return '-' + encodePathParam(trimmed.slice(1))
      }
      return encodePathParam(trimmed)
    })
    .join(',')
}
