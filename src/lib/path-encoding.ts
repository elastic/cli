/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value for use in a URL path segment.
 * Encodes all characters that are not unreserved (RFC 3986) plus `/`, `?`, and
 * `#` (handled by encodeURIComponent) so that the value cannot escape its path
 * segment. Sub-delimiters such as `!`, `'`, `(`, `)`, and critically `*` are
 * left unencoded – `*` must survive so that ES wildcard patterns like `logs-*`
 * continue to work.
 *
 * Empty, `.`, and `..` values are rejected by callers before this function is
 * reached (see buildCloudRequestParams / the ES path builder).
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    // encodeURIComponent leaves `!`, `'`, `(`, `)`, `*` unencoded per the
    // spec.  We deliberately do NOT re-encode `*` so that ES multi-target
    // wildcard patterns (e.g. `logs-*`) survive round-tripping through URL
    // construction.  Re-encode only `!`, `'`, `(`, `)` which have no
    // special meaning in ES path params and could confuse some HTTP stacks.
    .replace(/[!'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Encodes a multi-target path parameter (e.g. comma-separated index names).
 * Each individual target is encoded with `encodePathParam`, and commas that
 * separate targets are preserved so the cluster can still resolve them.
 *
 * Example: `"my-index,logs-*"` → `"my-index,logs-*"` (wildcard preserved)
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
