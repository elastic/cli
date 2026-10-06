/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encodes a single path parameter value using percent-encoding, preserving
 * characters that are safe in path segments per RFC 3986 but encoding
 * characters that would break URL parsing or allow traversal.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    .replace(/%2F/gi, '%2F')
}

/**
 * Encodes a multi-target path parameter (e.g. an index pattern like
 * `index1,index2` or `*`) for use in Elasticsearch API paths.
 *
 * Commas and asterisks are intentionally preserved so that multi-target
 * syntax continues to work as expected by the Elasticsearch API.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map(part => encodeURIComponent(part.trim()).replace(/%2A/gi, '*'))
    .join(',')
}
