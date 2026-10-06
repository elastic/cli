/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to embed in a URL
 * path. Uses `encodeURIComponent` which encodes everything except:
 *   A–Z a–z 0–9 - _ . ! ~ * ' ( )
 *
 * This intentionally encodes `/` so a single param value cannot introduce
 * extra path segments, and encodes `%` so pre-encoded input is not
 * double-decoded by the server.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
