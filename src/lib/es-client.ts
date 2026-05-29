/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getResolvedConfig } from '../config/store.ts'
import { buildAuthHeader, type ApiKeyOrBasicAuth } from './auth.ts'
import { clientHeaders } from './meta.ts'

export interface EsRequestParams {
  method: string
  path: string
  querystring?: Record<string, unknown>
  /** Object body → JSON-serialized; string body → sent as-is with application/json */
  body?: unknown
  /** NDJSON body → sent as-is with application/x-ndjson; takes precedence over `body` */
  bulkBody?: string
}

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

export class EsConnectionError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'EsConnectionError'
  }
}

/**
 * Lightweight HTTP client for Elasticsearch APIs.
 *
 * Uses the native `fetch` API rather than `@elastic/transport`. The CLI always
 * exits after a single HTTP request so connection pooling, node sniffing, and
 * dead-node resurrection provide no benefit.
 *
 * All requests automatically include `x-elastic-client-meta` and `user-agent`
 * headers via `clientHeaders()`.
 */
export class EsClient {
  readonly baseUrl: string
  private readonly authHeader: string | undefined
  private _fetch: typeof fetch = globalThis.fetch

  constructor (url: string, auth?: ApiKeyOrBasicAuth) {
    this.baseUrl = url.replace(/\/+$/, '')
    this.authHeader = buildAuthHeader(auth)
    if (this.baseUrl.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(this.baseUrl)) {
      process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
    }
  }

  async request<T = unknown>(
    params: EsRequestParams,
    opts?: { headers?: Record<string, string> }
  ): Promise<T> {
    let url = `${this.baseUrl}${params.path}`

    if (params.querystring != null && Object.keys(params.querystring).length > 0) {
      const pieces = Object.entries(params.querystring)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      if (pieces.length > 0) url += `?${pieces}`
    }

    const headers: Record<string, string> = {
      ...clientHeaders(),
      ...(this.authHeader != null && { 'Authorization': this.authHeader }),
      'Accept': 'application/json',
    }

    let fetchBody: string | undefined
    if (params.bulkBody !== undefined) {
      fetchBody = params.bulkBody
      headers['Content-Type'] = 'application/x-ndjson'
    } else if (typeof params.body === 'string') {
      fetchBody = params.body
      headers['Content-Type'] = 'application/json'
    } else if (params.body !== undefined) {
      fetchBody = JSON.stringify(params.body)
      headers['Content-Type'] = 'application/json'
    }

    if (opts?.headers != null) {
      Object.assign(headers, opts.headers)
    }

    const isHead = params.method.toUpperCase() === 'HEAD'

    let response: Response
    try {
      const method = fetchBody !== undefined && params.method.toUpperCase() === 'GET' ? 'POST' : params.method
      response = await this._fetch(url, {
        method,
        headers,
        ...(fetchBody !== undefined && { body: fetchBody }),
        redirect: 'error',
      })
    } catch (err) {
      throw new EsConnectionError(err instanceof Error ? err.message : String(err))
    }

    if (isHead) {
      if (response.ok) return true as T
      if (response.status === 404) return false as T
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text()
      }
      throw new EsResponseError(response.status, body)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    if (text.length === 0) return {} as T
    if (contentType.includes('application/json') || contentType.includes('application/x-ndjson')) {
      return JSON.parse(text) as T
    }
    return text as unknown as T
  }

  /** @internal test seam — replaces the fetch implementation for unit tests */
  _testSetFetch (fn: typeof fetch): void {
    this._fetch = fn
  }
}

let _client: EsClient | undefined

/**
 * Returns a lazily-created, cached `EsClient` configured from the
 * resolved config context's `elasticsearch` service block.
 *
 * @throws {Error} with code `missing_config` when no Elasticsearch service is configured
 */
export function getEsClient (): EsClient {
  if (_client != null) return _client

  const config = getResolvedConfig()
  const es = config?.context.elasticsearch

  if (es == null) {
    throw new Error(
      'missing_config: No Elasticsearch connection configured in the active context. ' +
      'Add an elasticsearch block to your .elasticrc.yml config file.'
    )
  }

  const { url, auth } = es
  const authRecord = auth != null ? auth as Record<string, unknown> : undefined

  let typedAuth: { api_key: string } | { username: string; password: string } | undefined
  if (typeof authRecord?.['api_key'] === 'string') {
    typedAuth = { api_key: authRecord['api_key'] as string }
  } else if (typeof authRecord?.['username'] === 'string' && typeof authRecord?.['password'] === 'string') {
    typedAuth = { username: authRecord['username'] as string, password: authRecord['password'] as string }
  }

  _client = new EsClient(url, typedAuth)
  return _client
}

/**
 * Resets the cached EsClient instance.
 *
 * @internal test seam — call in `afterEach` to prevent instance reuse across tests
 */
export function _testResetEsClient (): void {
  _client = undefined
}
