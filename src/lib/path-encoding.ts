/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path segment value so it is safe to embed in a URL path.
 *
 * Uses `encodeURIComponent` as the base (encodes everything except
 * unreserved characters: A-Z a-z 0-9 - _ . ~) then restores the subset of
 * sub-delimiters and other characters that RFC 3986 allows unencoded inside a
 * path segment: ! $ & ' ( ) * + , ; = : @
 *
 * Critically, `/` and `%2F` remain encoded so a caller cannot inject a path
 * separator. Empty string, `.`, and `..` are rejected because they would
 * widen or traverse the request scope.
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

  // encodeURIComponent encodes everything except: A-Z a-z 0-9 - _ . ~
  // Restore characters that are legal unencoded inside a path segment per
  // RFC 3986 section 3.3 (pchar = unreserved / pct-encoded / sub-delims / ":" / "@").
  return encodeURIComponent(value).replace(
    /%(?:21|24|26|27|28|29|2A|2B|2C|3B|3D|3A|40)/gi,
    (match) => decodeURIComponent(match)
  )
}
