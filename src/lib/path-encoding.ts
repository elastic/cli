/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path. Uses `encodeURIComponent` as the base (which encodes everything except
 * `A-Z a-z 0-9 - _ . ! ~ * ' ( )`) then restores the subset of RFC 3986
 * sub-delimiters / unreserved characters that are legal unencoded inside a
 * path segment: `! $ & ' ( ) * + , ; = : @`.
 *
 * Empty string, `.`, and `..` are rejected because they would widen or
 * traverse the request scope.
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
  // Restore characters that are safe unencoded in a path segment per RFC 3986.
  return encodeURIComponent(value)
    .replace(/%21/g, '!')
    .replace(/%24/g, '$')
    .replace(/%26/g, '&')
    .replace(/%27/g, "'")
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2A/gi, '*')
    .replace(/%2B/gi, '+')
    .replace(/%2C/gi, ',')
    .replace(/%3A/gi, ':')
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=')
    .replace(/%40/gi, '@')
}
