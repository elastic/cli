/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value for use in a URL path segment.
 * Encodes all characters that are not unreserved (RFC 3986) plus a safe subset
 * of sub-delimiters, ensuring the value cannot escape its path segment.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    // encodeURIComponent does not encode these sub-delimiters; re-encode them
    // so that e.g. a slash inside a param value cannot split the path.
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Encodes a multi-target path parameter (e.g. comma-separated index names).
 * Each individual target is encoded with `encodePathParam`, and commas that
 * separate targets are preserved so the cluster can still resolve them.
 *
 * For example: `"my-index,logs-*"` → `"my-index%2Clogs-*"` is NOT what we
 * want; instead we encode each segment individually and rejoin with commas.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
