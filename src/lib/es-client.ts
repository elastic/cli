/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getResolvedConfig } from '../config/store.ts'
import { isEsViaKibana } from '../config/types.ts'
import { buildAuthHeader, narrowAuth, type ApiKeyOrBasicAuth } from './auth.ts'
import { EsConsoleProxyClient } from './es-console-proxy-client.ts'
import {
  buildEsQueryString,
  EsConnectionError,
  EsResponseError,
  type EsRequestParams,
  type EsTransport,
} from './es-transport.ts'
import { clientHeaders } from './meta.ts'

// The transport contract lives in `es-transport.ts` so that other transports can depend
// on it without importing this module. Re-exported here for existing consumers.
export {
  buildEsQueryString,
  EsConnectionError,
  EsResponseError,
  type EsRequestParams,
  type EsTransport,
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
export class EsClient implements EsTransport {
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

    const queryString = buildEsQueryString(params.querystring)
    if (queryString.length > 0) url += `?${queryString}`

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

let _client: EsTransport | undefined

/**
 * Returns a lazily-created, cached Elasticsearch transport configured from the
 * resolved config context's `elasticsearch` service block.
 *
 * Returns a direct {@link EsClient} for a block with a `url`, or a transport that
 * forwards through Kibana when the block declares `via: kibana`.
 *
 * @throws {Error} with code `missing_config` when no Elasticsearch service is configured,
 *   or when `via: kibana` is set without a `kibana` block to route through
 */
export function getEsClient (): EsTransport {
  if (_client != null) return _client

  const config = getResolvedConfig()
  const es = config?.context.elasticsearch

  if (es == null) {
    throw new Error(
      'missing_config: No Elasticsearch connection configured in the active context. ' +
      'Add an elasticsearch block to your .elasticrc.yml config file.'
    )
  }

  if (isEsViaKibana(es)) {
    const kibana = config?.context.kibana
    if (kibana == null) {
      throw new Error(
        'missing_config: elasticsearch is configured with "via: kibana" but the active ' +
        'context has no kibana block. Add one, or replace "via" with an elasticsearch url.'
      )
    }
    _client = new EsConsoleProxyClient(kibana.url, narrowAuth(kibana.auth))
    return _client
  }

  if (es.url == null) {
    throw new Error(
      'missing_config: The elasticsearch block has no url. Set a url, or use ' +
      '"via: kibana" to route requests through Kibana.'
    )
  }

  _client = new EsClient(es.url, narrowAuth(es.auth))
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
