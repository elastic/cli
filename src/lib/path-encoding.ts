/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value.
 *
 * Encodes everything that `encodeURIComponent` encodes, plus additionally
 * encodes `/` and `%` so that a value cannot inject extra path segments or
 * double-encode existing percent-sequences.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value).replace(/%25/g, '%25').replace(/\//g, '%2F')
}

/**
 * Encodes a multi-target path parameter (e.g. index names that may be
 * comma-separated). Each comma-separated segment is encoded individually so
 * that the comma delimiter is preserved while special characters within each
 * target name are safely percent-encoded.
 *
 * Example: `"my-index,other/index"` → `"my-index,other%2Findex"`
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value.split(',').map((segment) => encodePathParam(segment)).join(',')
}
