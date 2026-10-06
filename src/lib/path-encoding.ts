/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value so that it cannot be used to
 * traverse outside its intended path segment.
 *
 * Uses `encodeURIComponent` which encodes all characters except:
 *   A–Z a–z 0–9 - _ . ! ~ * ' ( )
 *
 * This means `/`, `?`, `#`, `@`, `:` and other reserved characters that could
 * alter the structure of the URL are always encoded.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
