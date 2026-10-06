/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Percent-encodes a single path parameter value for use in a URL path segment.
 *
 * Encodes all characters that are not unreserved (RFC 3986) or sub-delimiters,
 * plus `:`, `@`, `!`, `$`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `;`, `=`
 * (i.e. the pchar production minus `/`). In practice this means all characters
 * that could be misinterpreted as path separators or reserved URI syntax are
 * escaped, while letters, digits, `-`, `.`, `_`, `~` are passed through.
 */
export function encodePathParam (value: string): string {
  // encodeURIComponent encodes everything except: A-Z a-z 0-9 - _ . ! ~ * ' ( )
  // We additionally encode ! ~ * ' ( ) to be conservative.
  return encodeURIComponent(value).replace(/[!'()*~]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

/**
 * Encodes a multi-target path parameter (e.g. an index pattern like
 * `index1,index2,alias*`) for use in a URL path segment.
 *
 * Each comma-separated target is encoded individually with `encodePathParam`
 * and the results are rejoined with `,`. This preserves the multi-target
 * semantics expected by Elasticsearch while still encoding characters that
 * could be misinterpreted as URL structural characters within each target.
 *
 * A `*` wildcard within an individual target is left encoded (as `%2A`) so
 * that the server receives the literal asterisk only after decoding – this is
 * the same behaviour as encoding the whole string with `encodeURIComponent`.
 */
export function encodeMultiTargetPathParam (value: string): string {
  return value
    .split(',')
    .map((target) => encodePathParam(target.trim()))
    .join(',')
}
