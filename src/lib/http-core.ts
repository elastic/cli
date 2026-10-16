/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Transport plumbing shared by the Elasticsearch, Kibana, and Cloud clients. Headers, bodies, and
// response decoding stay in each client because they differ per product.

import { isLoopbackUrl } from './is-loopback-host.ts'
import { toConnectionError } from './http-errors.ts'

/**
 * Joins `base` and `path` and appends the querystring.
 *
 * Values go through `String()`, so callers serialize arrays in their product's wire format first.
 * `undefined` values are skipped, and no `?` is added when nothing is left.
 *
 * @param base - base URL without a trailing slash
 * @param path - absolute path, already encoded
 * @param qs - querystring values keyed by parameter name
 */
export function buildUrl (base: string, path: string, qs?: Record<string, unknown>): string {
  const url = `${base}${path}`
  // encodeURIComponent, not URLSearchParams: spaces go out as %20, not +
  const pieces = Object.entries(qs ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return pieces.length > 0 ? `${url}?${pieces.join('&')}` : url
}

/** Writes a stderr warning when `url` is plaintext HTTP to a host other than loopback. */
export function warnIfPlaintext (url: string): void {
  if (url.startsWith('http://') && !isLoopbackUrl(url)) {
    process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
  }
}

/**
 * Sends one HTTP request.
 *
 * @param fetchFn - fetch implementation (each client's test seam)
 * @param url - full request URL
 * @param init - request options; the caller picks the redirect policy
 * @throws {ConnectionError} when the request never reached the server
 */
export async function send (fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init)
  } catch (err) {
    throw toConnectionError(err)
  }
}
