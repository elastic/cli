/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path segment value so it is safe to interpolate
 * into a URL path. Uses encodeURIComponent and then restores characters that
 * are allowed unencoded in path segments per RFC 3986.
 */
export function encodePathParam (value: string): string {
  return encodeURIComponent(value)
    .replace(/%21/g, '!')
    .replace(/%24/g, '$')
    .replace(/%26/g, '&')
    .replace(/%27/g, "'")
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2A/g, '*')
    .replace(/%2B/g, '+')
    .replace(/%3B/g, ';')
    .replace(/%3D/g, '=')
    .replace(/%40/g, '@')
}

/**
 * Encodes a multi-target parameter value used in Elasticsearch APIs (e.g.
 * index patterns like `index1,index2,my-*`). Each comma-separated target is
 * individually encoded with `encodePathParam` while commas are preserved as
 * the separator between targets.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target))
    .join(',')
}
