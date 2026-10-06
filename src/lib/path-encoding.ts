/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that are safe to leave unencoded in a single path segment.
 * This matches the set that the Elasticsearch JS client uses so round-trips
 * are lossless for typical index / alias / data-stream names.
 */
const SAFE_PATH_CHARS = /[^A-Za-z0-9\-._~!$&'()*+,;=:@]/g

/**
 * Percent-encodes a single path parameter value.
 *
 * Commas are encoded so that a caller cannot accidentally inject multiple
 * targets into a single-target route. Use `encodeMultiTargetPathParam` when
 * a comma-separated list of targets is intentional.
 */
export function encodePathParam (value: string): string {
  return value.replace(SAFE_PATH_CHARS, (ch) => {
    const code = ch.codePointAt(0)!
    if (code > 0xffff) {
      // Surrogate pair — encode both code units
      const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const lo = ((code - 0x10000) % 0x400) + 0xdc00
      return (
        '%' + hi.toString(16).toUpperCase().padStart(4, '0').replace(/../g, (b) => '%' + b) +
        '%' + lo.toString(16).toUpperCase().padStart(4, '0').replace(/../g, (b) => '%' + b)
      )
    }
    return encodeURIComponent(ch)
  })
}

/**
 * Percent-encodes a multi-target path parameter where the value may contain
 * comma-separated target names (indices, aliases, data streams, etc.).
 *
 * Each individual target name is encoded with `encodePathParam` so that
 * special characters within a name are safe, but the commas that delimit
 * targets are preserved as-is.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target))
    .join(',')
}
