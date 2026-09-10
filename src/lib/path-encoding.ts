/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// `encodeURIComponent` leaves `.` and `..` untouched (they're unreserved), and
// encodes an empty string to `''`. A URL-consuming layer normalizes `/./`,
// `/../`, and empty segments out of the path, silently widening a single-target
// request (e.g. a specific index) to the resource root (e.g. the whole cluster).
// Reject these before they ever reach a path.
export function assertSafePathSegment (segment: string, original: string): void {
  if (segment === '' || segment === '.' || segment === '..') {
    const context = segment === original ? '' : ` (within "${original}")`
    throw Object.assign(
      new Error(`Invalid path parameter "${segment}"${context}: empty, ".", and ".." segments are rejected because they resolve to the parent/root resource instead of a specific target`),
      { code: 'input_error' }
    )
  }
}

/** Encodes a single path parameter value, rejecting empty, `.`, and `..`. */
export function encodePathParam (value: string): string {
  assertSafePathSegment(value, value)
  return encodeURIComponent(value)
}

/**
 * Encodes a path parameter that may use Elasticsearch multi-target syntax
 * (e.g. `"idx1,idx2"`). Each comma-separated segment is trimmed, validated,
 * and percent-encoded individually; commas are preserved as separators.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value.split(',').map((s) => {
    const trimmed = s.trim()
    assertSafePathSegment(trimmed, value)
    return encodeURIComponent(trimmed)
  }).join(',')
}
