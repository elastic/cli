/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path parameter value for safe inclusion in a URL path
 * segment. Uses encodeURIComponent as the base and additionally encodes
 * characters that are technically allowed by RFC 3986 in path segments but
 * could be misinterpreted by proxies or servers (!, ', (, ), *, ~).
 *
 * Does NOT encode forward slashes — callers are expected to pass individual
 * decoded segments, not full paths.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
}
