/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path segment value so it is safe to embed in a URI path.
 *
 * Uses `encodeURIComponent` as the base, which encodes everything except
 * A-Z a-z 0-9 - _ . ! ~ * ' ( ).  This is intentionally stricter than the
 * set of characters that are technically allowed unencoded in a path segment
 * so that values such as `/` cannot introduce extra path segments.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
