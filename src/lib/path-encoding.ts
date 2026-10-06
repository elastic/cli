/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single decoded path segment value so it is safe to embed in a URL
 * path. Uses encodeURIComponent as the base (encodes everything except
 * unreserved characters) and then restores characters that are explicitly
 * allowed in a path segment by RFC 3986 (sub-delimiters + `:` `@`) so that
 * values like "my:index" or "user@host" round-trip without double-encoding.
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
    .replace(/%3A/gi, ':')
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=')
    .replace(/%40/gi, '@')
}
