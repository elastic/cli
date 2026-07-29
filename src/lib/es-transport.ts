/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Elasticsearch transport contract, shared by every implementation.
 *
 * Kept separate from the concrete clients so that a transport (e.g. the Kibana
 * Console proxy) can depend on the contract without importing the direct client,
 * which would introduce an import cycle.
 */

export interface EsRequestParams {
  method: string
  path: string
  querystring?: Record<string, unknown>
  /** Object body → JSON-serialized; string body → sent as-is with application/json */
  body?: unknown
  /** NDJSON body → sent as-is with application/x-ndjson; takes precedence over `body` */
  bulkBody?: string
}

/**
 * The contract every Elasticsearch transport satisfies.
 *
 * Commands and helpers depend on this rather than on a concrete client, so requests
 * can be sent directly or forwarded through Kibana without any change to callers.
 */
export interface EsTransport {
  request<T = unknown>(
    params: EsRequestParams,
    opts?: { headers?: Record<string, string> }
  ): Promise<T>
  /** @internal test seam — replaces the fetch implementation for unit tests */
  _testSetFetch (fn: typeof fetch): void
}

/** An error response returned by Elasticsearch, carrying its status code and body. */
export class EsResponseError extends Error {
  statusCode: number
  body: unknown

  constructor (statusCode: number, body: unknown) {
    const message = body != null && typeof body === 'object' && 'error' in body
      ? JSON.stringify((body as Record<string, unknown>).error)
      : String(body)
    super(message)
    this.name = 'EsResponseError'
    this.statusCode = statusCode
    this.body = body
  }
}

/** A failure to reach Elasticsearch at all — DNS, TLS, timeouts, or a rejecting proxy. */
export class EsConnectionError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'EsConnectionError'
  }
}

/**
 * Serializes an Elasticsearch querystring, skipping `undefined` values.
 *
 * Shared so that transports carrying the querystring differently — such as folding it
 * into a proxy's `path` parameter — encode it identically to a direct connection.
 *
 * @returns the encoded querystring without a leading `?`, or an empty string
 */
export function buildEsQueryString (querystring: Record<string, unknown> | undefined): string {
  if (querystring == null) return ''
  return Object.entries(querystring)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}
