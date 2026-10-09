/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { encodePathParam } from '../lib/path-encoding.ts'

export interface EncodedApiPath {
  pathname: string
  query: Record<string, string>
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
 * Splits a user-supplied request path into an encoded pathname and query map.
 *
 * Query string and fragment are stripped before encoding. Each path segment is
 * decoded, rejected if it is empty / `.` / `..`, then percent-encoded so a
 * caller cannot traverse to the parent resource via `../` or `%2e%2e`.
 */
export function encodeApiPath (raw: string): EncodedApiPath {
  const hash = raw.indexOf('#')
  const withoutHash = hash === -1 ? raw : raw.slice(0, hash)
  const q = withoutHash.indexOf('?')
  const pathPart = (q === -1 ? withoutHash : withoutHash.slice(0, q)).trim()
  const queryPart = q === -1 ? '' : withoutHash.slice(q + 1)

  const withSlash = pathPart === '' ? '/' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  const segments = withSlash.split('/')
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

  const query: Record<string, string> = {}
  if (queryPart !== '') {
    for (const [key, value] of new URLSearchParams(queryPart)) {
      query[key] = value
    }
  }
  return { pathname, query }
}
