/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { encodePathParam } from '../lib/path-encoding.ts'

export interface EncodedApiPath {
  pathname: string
  /** Includes the leading `?`, or `''`. Repeated keys are preserved. */
  search: string
}

function inputError (message: string): never {
  throw Object.assign(new Error(message), { code: 'input_error' })
}

function decodeSegment (segment: string, original: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    inputError(`Invalid path parameter "${segment}" (within "${original}"): malformed percent-encoding`)
  }
}

/**
 * Splits a user-supplied request path into an encoded pathname and query string.
 *
 * `URL` splits the query and fragment. Path segments are taken from the raw
 * string first: `URL` collapses `.` and `..` (including `%2e%2e`) before we
 * can reject them.
 */
export function encodeApiPath (raw: string): EncodedApiPath {
  const trimmed = raw.trim()
  const prefixed = trimmed === '' || trimmed.startsWith('/') || trimmed.startsWith('?') || trimmed.startsWith('#')
    ? (trimmed === '' ? '/' : trimmed)
    : `/${trimmed}`

  let url: URL
  try {
    url = new URL(prefixed, 'https://example.invalid')
  } catch (err) {
    inputError(`Invalid path "${raw}": ${err instanceof Error ? err.message : String(err)}`)
  }

  const cut = prefixed.search(/[?#]/)
  const pathPart = cut === -1 ? prefixed : prefixed.slice(0, cut)
  const segments = pathPart.split('/')
  const encoded: string[] = ['']
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (seg == null || seg === '') {
      if (i === segments.length - 1) continue
      inputError(`Invalid path parameter "" (within "${raw}"): empty, ".", and ".." segments are rejected because they resolve to the parent/root resource instead of a specific target`)
    }
    encoded.push(encodePathParam(decodeSegment(seg, raw)))
  }
  const pathname = encoded.length === 1 ? '/' : encoded.join('/')
  return { pathname, search: url.search }
}
