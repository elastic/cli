/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single decoded path segment value so it is safe to
 * interpolate into a URL path without allowing path traversal or injection.
 *
 * Uses `encodeURIComponent` which encodes every character except:
 *   A-Z a-z 0-9 - _ . ! ~ * ' ( )
 *
 * This is intentionally stricter than RFC 3986 pchar (which allows `:@!$&'()*+,;=`
 * unencoded) because we want round-trip safety: any value that decodes to `.`
 * or `..` will already have been rejected before this function is called.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
