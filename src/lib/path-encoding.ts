/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value (already decoded).
 *
 * Uses `encodeURIComponent` as the base (which encodes everything except
 * `A-Z a-z 0-9 - _ . ! ~ * ' ( )`) then restores characters that are
 * legal unencoded in a path segment per RFC 3986:
 *   sub-delimiters : ! $ & ' ( ) * + , ; =
 *   colon          : (allowed in non-first segments)
 *   at-sign        : @
 *
 * Characters that MUST remain encoded in path segments (e.g. `/`, `?`, `#`,
 * `[`, `]`) are intentionally left encoded.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    // Restore RFC 3986 sub-delimiters that are safe in path segments
    .replace(/%21/gi, '!')
    .replace(/%24/gi, '$')
    .replace(/%26/gi, '&')
    .replace(/%27/gi, "'")
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')')
    .replace(/%2A/gi, '*')
    .replace(/%2B/gi, '+')
    .replace(/%2C/gi, ',')
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=')
    // Restore colon and at-sign
    .replace(/%3A/gi, ':')
    .replace(/%40/gi, '@')
}
