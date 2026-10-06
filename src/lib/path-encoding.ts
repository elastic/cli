/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value using RFC 3986 rules,
 * preserving characters that are safe in a URI path segment.
 *
 * Unlike `encodeURIComponent` this keeps a small set of sub-delimiter
 * characters (`!`, `$`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `;`, `=`,
 * `@`, `:`) that are legal in a path segment per RFC 3986 §3.3 and are
 * used by Elasticsearch (e.g. date-math, index patterns).
 *
 * Characters that ARE encoded: `/`, `?`, `#`, `%`, and everything outside
 * the unreserved + sub-delimiter sets.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    // Restore sub-delimiters and other characters that are safe in path segments
    .replace(/%21/g, '!')
    .replace(/%24/g, '$')
    .replace(/%26/g, '&')
    .replace(/%27/g, "'")
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2A/gi, '*')
    .replace(/%2B/gi, '+')
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=')
    .replace(/%40/gi, '@')
    .replace(/%3A/gi, ':')
}

/**
 * Encodes a multi-target parameter value (e.g. comma-separated index names
 * such as `"logs-*,metrics-*"`) by encoding each target individually while
 * preserving the commas that delimit them.
 *
 * Each individual target is encoded with `encodePathParam`, so date-math
 * expressions and other sub-delimiter characters remain valid.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
