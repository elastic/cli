/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path without being misinterpreted as a path separator or query delimiter.
 *
 * Uses `encodeURIComponent` as the base (which encodes everything except
 * unreserved characters: A-Z a-z 0-9 - _ . ~) and then restores the
 * sub-delimiters that are legal unencoded within a path segment per RFC 3986
 * section 3.3: ! $ & ' ( ) * + , ; =
 *
 * Crucially, `/` is NOT restored so that a value containing a slash cannot
 * traverse into a different path segment.
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
    .replace(/%40/gi, '@')
    .replace(/%3A/gi, ':')
}
