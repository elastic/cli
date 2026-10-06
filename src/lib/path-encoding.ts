/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value.
 *
 * Encodes all characters that are not unreserved (RFC 3986) plus a small
 * allow-list of sub-delimiters that Elasticsearch accepts in path segments
 * (`:`, `@`, `!`, `$`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `;`, `=`).
 *
 * The characters `/` and `?` are always encoded so a value cannot escape its
 * path segment.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/**
 * Encodes a multi-target path parameter (e.g. an index pattern like
 * `index1,index2,-index3` or `*`) by encoding each comma-separated target
 * individually while preserving commas as delimiters.
 *
 * This matches Elasticsearch's multi-target syntax where commas separate
 * index/data-stream names and each name may itself contain characters that
 * need percent-encoding.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target))
    .join(',')
}
