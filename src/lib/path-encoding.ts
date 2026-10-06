/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single decoded path segment value for use in a URL path.
 *
 * Uses encodeURIComponent as the base (encodes everything except unreserved
 * characters A-Z a-z 0-9 - _ . ~) then restores the additional characters
 * that are safe inside a path segment per RFC 3986 sub-delims and pchar.
 *
 * Critically, / is NOT restored so a value containing a slash cannot
 * introduce extra path segments, and . / .. are rejected by the caller.
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
    .replace(/%3A/gi, ':')
    .replace(/%40/gi, '@')
}
