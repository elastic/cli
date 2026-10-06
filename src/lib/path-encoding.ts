/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path segment value so it is safe to embed in a URL path.
 *
 * Uses `encodeURIComponent` which percent-encodes everything except
 * unreserved characters (A-Z a-z 0-9 - _ . ~). The `/` character is
 * therefore encoded as `%2F`, preventing path traversal via injected slashes.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
