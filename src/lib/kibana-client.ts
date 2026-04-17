/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getResolvedConfig } from '../config/store.ts'

export type KibanaHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH'

/**
 * Parameters for a single Kibana API request.
 */
export interface KibanaRequestParams {
  method: KibanaHttpMethod
  path: string
  querystring?: Record<string, unknown>
  body?: unknown
}

/**
 * Lightweight HTTP client for Kibana APIs.
 *
 * Uses the native `fetch` API (like `CloudClient`) rather than `@elastic/transport`,
 * since the Kibana API is a standard REST service with no ES-specific requirements.
 *
 * Differences from `CloudClient`:
 * - Supports both API key and basic (username/password) auth
 * - Automatically adds the `kbn-xsrf: true` header for non-GET/HEAD requests,
 *   which Kibana requires to protect against CSRF
 */
export class KibanaClient {
  readonly baseUrl: string
  private readonly authHeader: string
  private _fetch: typeof fetch = globalThis.fetch

  constructor (baseUrl: string, auth: { api_key: string } | { username: string; password: string }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    if ('api_key' in auth) {
      this.authHeader = `ApiKey ${auth.api_key}`
    } else {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
      this.authHeader = `Basic ${encoded}`
    }
    if (this.baseUrl.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(this.baseUrl)) {
      process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
    }
  }

  /**
   * Sends an HTTP request to the Kibana API and returns the parsed JSON response.
   *
   * @throws {Error} on non-2xx responses, including the status code and response body
   */
  async request (params: KibanaRequestParams): Promise<unknown> {
    let url = `${this.baseUrl}${params.path}`

    if (params.querystring != null && Object.keys(params.querystring).length > 0) {
      const pieces = Object.entries(params.querystring)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      url += `?${pieces}`
    }

    const method = params.method.toUpperCase()
    const headers: Record<string, string> = {
      'Authorization': this.authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }

    // Kibana requires kbn-xsrf for all state-mutating requests to protect against CSRF
    if (method !== 'GET' && method !== 'HEAD') {
      headers['kbn-xsrf'] = 'true'
    }

    const init: RequestInit = { method, headers, redirect: 'error' }

    if (params.body !== undefined) {
      init.body = JSON.stringify(params.body)
    }

    const response = await this._fetch(url, init)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Kibana API error ${response.status}: ${text}`)
    }

    const text = await response.text()
    return text.length > 0 ? JSON.parse(text) : {}
  }

  /**
   * @internal test seam — replaces the fetch implementation for unit tests
   */
  _testSetFetch (fn: typeof fetch): void {
    this._fetch = fn
  }
}

let _client: KibanaClient | undefined

/**
 * Returns a lazily-created, cached `KibanaClient` configured from the
 * resolved config context's `kibana` service block.
 *
 * Supports both API key and basic (username/password) authentication.
 *
 * @throws {Error} with `missing_config` when no Kibana service is configured or auth is invalid
 */
export function getKibanaClient (): KibanaClient {
  if (_client != null) return _client

  const config = getResolvedConfig()
  const kb = config?.context.kibana

  if (kb == null) {
    throw new Error(
      'missing_config: No Kibana connection configured in the active context. ' +
      'Add a kibana block to your .elasticrc.yml config file.'
    )
  }

  const { url, auth } = kb
  const authRecord = auth as Record<string, unknown>

  let typedAuth: { api_key: string } | { username: string; password: string }
  if (typeof authRecord['api_key'] === 'string') {
    typedAuth = { api_key: authRecord['api_key'] }
  } else if (typeof authRecord['username'] === 'string' && typeof authRecord['password'] === 'string') {
    typedAuth = { username: authRecord['username'], password: authRecord['password'] }
  } else {
    throw new Error(
      'missing_config: Kibana auth requires either api_key or username/password. ' +
      'Check your .elasticrc.yml config file.'
    )
  }

  _client = new KibanaClient(url, typedAuth)
  return _client
}

/**
 * Resets the cached KibanaClient instance.
 *
 * @internal test seam — call in `afterEach` to prevent instance reuse across tests
 */
export function _testResetKibanaClient (): void {
  _client = undefined
}
