/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value.
 *
 * Encodes all characters that are not unreserved (RFC 3986) or sub-delimiters,
 * plus forward-slash, so that a caller cannot traverse to a parent resource
 * via a crafted parameter value.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Encodes a multi-target path parameter (comma-separated list of index/alias
 * names) by encoding each target individually and rejoining with a comma.
 *
 * This preserves the comma as a separator while ensuring each individual
 * target name is safely percent-encoded.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value.split(',').map((target) => encodePathParam(target.trim())).join(',')
}
