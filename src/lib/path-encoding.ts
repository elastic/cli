/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Throws if `value` is an empty string or a dot-only segment (`'.'`, `'..'`).
 * Called by `encodePathParam` to prevent a single-target route from silently
 * resolving to the parent or cluster root.
 */
export function assertSafePathSegment (value: string): void {
  if (value === '') throw new Error('Path parameter must not be empty')
  if (value === '.' || value === '..') {
    throw new Error(`Path parameter must not be '${value}'`)
  }
}

/**
 * Percent-encodes a single path parameter value using `encodeURIComponent`,
 * then restores characters that are universally safe inside a path segment
 * (RFC 3986 §3.3) and that the Elasticsearch JS client also leaves unencoded
 * for lossless round-trips.
 *
 * Commas are intentionally NOT restored here so that a caller cannot
 * accidentally inject multiple targets into a single-target route.
 * Use `encodeMultiTargetPathParam` when a comma-separated list is intentional.
 */
export function encodePathParam (value: string): string {
  assertSafePathSegment(value)
  // encodeURIComponent handles all Unicode correctly (including non-BMP via
  // surrogate pairs) by operating on the full string rather than code-unit by
  // code-unit.
  return encodeURIComponent(value)
    // Restore safe sub-delimiters and unreserved chars that do not need
    // encoding inside a path segment (mirrors the Elasticsearch JS client).
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
    .replace(/%3A/gi, ':')
    .replace(/%40/gi, '@')
    .replace(/%7E/gi, '~')
}

/**
 * Percent-encodes a multi-target path parameter where the value may contain
 * comma-separated target names (indices, aliases, data streams, etc.).
 *
 * Each individual target name is trimmed and then encoded with
 * `encodePathParam` so that special characters within a name are safe, while
 * the commas that delimit targets are preserved as-is.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
