/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URI
 * path without being mistaken for a path separator or a reserved character.
 *
 * Characters in the RFC 3986 "unreserved" set (ALPHA / DIGIT / "-" / "." /
 * "_" / "~") are left as-is. Everything else is percent-encoded.
 *
 * Note: "." and ".." should be rejected by callers *before* calling this
 * function; this function encodes them (to "." and "..") rather than blocking
 * them, because the rejection responsibility belongs to the validation layer.
 */
export function encodePathParam (value: string): string {
  // encodeURIComponent encodes everything except: A-Z a-z 0-9 - _ . ! ~ * ' ( )
  // We additionally encode ! * ' ( ) to keep only the strict unreserved set
  // plus the characters that are universally safe inside a path segment.
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}
