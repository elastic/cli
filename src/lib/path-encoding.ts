/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path segment value for safe inclusion in a URL path.
 *
 * Uses encodeURIComponent as the base (which encodes everything except
 * unreserved characters: A-Z a-z 0-9 - _ . ~) and additionally restores
 * sub-delimiters that are safe within a path segment per RFC 3986:
 *   ! $ & ' ( ) * + , ; =
 *
 * Critically, `/` is NOT restored, preventing path traversal via encoded
 * slashes. `%` is encoded by encodeURIComponent so double-encoding is avoided.
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

  // encodeURIComponent covers everything; restore safe sub-delimiters.
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
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=')
    .replace(/%40/gi, '@')
    .replace(/%3A/gi, ':')
}
