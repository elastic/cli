/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value (already decoded) so it is safe
 * to embed in a URL path. Uses encodeURIComponent which encodes everything
 * except unreserved characters (A-Z a-z 0-9 - _ . ~), then restores the
 * sub-delimiters that are legal inside a path segment per RFC 3986:
 *   ! $ & ' ( ) * + , ; =
 * We intentionally keep `:` and `@` encoded for safety.
 */
export function encodePathParam (value: string): string {
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
}
