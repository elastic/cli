/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that must NOT be percent-encoded in a path segment, per RFC 3986
 * unreserved + sub-delimiters + `:` + `@`.
 *
 * We intentionally exclude `/` (path separator) and `?` / `#` (query/fragment
 * delimiters) so they are always encoded when they appear inside a segment.
 */
const PATH_PARAM_SAFE = /[A-Za-z0-9\-._~!$&'()*+,;=:@]/

/**
 * Percent-encodes a single path segment value.
 *
 * Uses `encodeURIComponent` as a base (which encodes everything except
 * unreserved characters) then restores the small set of sub-delimiters and
 * other characters that are safe inside a path segment.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(
    /%[0-9A-F]{2}/g,
    (pct) => {
      const ch = decodeURIComponent(pct)
      return PATH_PARAM_SAFE.test(ch) ? ch : pct
    }
  )
}

/**
 * Encodes a multi-target path parameter (comma-separated list of index names /
 * data-stream names / aliases).
 *
 * Each individual target is encoded with `encodePathParam`; the commas that
 * separate targets are preserved so that Elasticsearch receives them as the
 * standard multi-target syntax.
 *
 * Example: `"my-index,logs-*"` → `"my-index,logs-%2A"` (if `*` were not safe)
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
