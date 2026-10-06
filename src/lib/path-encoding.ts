/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that must NOT be percent-encoded in an Elasticsearch path
 * segment. RFC 3986 unreserved characters plus the sub-delimiters that ES
 * uses inside a single segment (`:` for date-math, `@` for data-stream
 * naming conventions, `+` for date-math, `~` kept unreserved).
 *
 * We deliberately encode `/` so callers cannot accidentally traverse to a
 * parent resource, and we encode `?` / `#` so they cannot inject a query
 * string or fragment.
 */
const SAFE = /[A-Za-z0-9\-._~!$&'()*+,;=:@]/

/**
 * Percent-encodes a single Elasticsearch path-parameter value.
 *
 * Unlike `encodeURIComponent` this preserves a handful of sub-delimiter
 * characters that are legal and meaningful inside an ES path segment
 * (e.g. `:` in date-math expressions, `,` in multi-target syntax when the
 * whole multi-target string is treated as one segment).
 *
 * `/`, `?`, and `#` are always encoded so the value cannot escape its
 * segment or inject a query string.
 *
 * Throws if `value` is empty or is the dot-segment `.` or `..`, because
 * those would allow a caller to silently traverse to a parent resource after
 * URL normalization (the exact attack the original assertSafePathSegment
 * guard was designed to prevent).
 */
export function encodePathParam (value: string): string {
  if (value === '') {
    throw new Error('Path parameter value must not be empty')
  }
  if (value === '.' || value === '..') {
    throw new Error(`Path parameter value must not be a dot-segment: '${value}'`)
  }

  let out = ''
  for (const ch of value) {
    if (SAFE.test(ch)) {
      out += ch
    } else {
      const cp = ch.codePointAt(0) as number
      if (cp > 0x7f) {
        // Encode multi-byte characters via TextEncoder-style UTF-8 byte sequence.
        out += encodeURIComponent(ch)
      } else {
        out += `%${cp.toString(16).toUpperCase().padStart(2, '0')}`
      }
    }
  }
  return out
}

/**
 * Encodes a multi-target Elasticsearch path parameter.
 *
 * A multi-target value is a comma-separated list of index names / patterns
 * (e.g. `"logs-*,metrics-*"`). Each individual target is trimmed and then
 * encoded with `encodePathParam` while the commas that separate them are
 * preserved so that Elasticsearch receives the full multi-target syntax.
 *
 * The special catch-all value `"_all"` is returned as-is without encoding.
 *
 * Throws if any individual target is empty (e.g. a leading/trailing comma
 * or consecutive commas) or is a dot-segment.
 */
export function encodeMultiTargetPathParam (value: string): string {
  if (value === '_all') return value
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
