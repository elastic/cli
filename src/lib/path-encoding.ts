/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single decoded path segment so it is safe to embed in a
 * URL path. Uses `encodeURIComponent` which encodes every character that is
 * not unreserved (A-Z a-z 0-9 - _ . ~) plus characters that would be
 * mistaken for path separators or query/fragment delimiters.
 *
 * Each call receives a single already-split segment; the caller is responsible
 * for splitting on `/` before invoking this function.
 *
 * Empty string, `.`, and `..` are NOT rejected here - callers that need
 * that validation (e.g. `encodeApiPath`) perform it before calling
 * `encodePathParam`.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}
