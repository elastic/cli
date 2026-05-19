/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpMethod } from '../cloud/types.ts'
import { getResolvedConfig } from '../config/store.ts'
import { isLoopbackUrl } from './is-loopback-host.ts'
import { clientHeaders } from './meta.ts'

/**
 * Parameters for a single Cloud API request.
 */
export interface CloudRequestParams {
  method: HttpMethod
  path: string
  querystring?: Record<string, string>
  body?: unknown
}

/**
 * Lightweight HTTP client for Elastic Cloud control plane APIs.
 *
 * Uses the native `fetch` API rather than `@elastic/transport`, since the
 * Cloud API is a standard REST service with no ES-specific connection
 * pooling, sniffing, or product-check requirements.
 */
export class CloudClient {
  readonly baseUrl: string
  private readonly apiKey: string
  private _fetch: typeof fetch = globalThis.fetch

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
    if (this.baseUrl.startsWith('http://') && !isLoopbackUrl(this.baseUrl)) {
      process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
    }
  }

  /**
   * Sends an HTTP request to the Cloud API and returns the parsed JSON response.
   *
   * @throws {Error} on non-2xx responses, including the status code and response body
   */
  async request(params: CloudRequestParams): Promise<unknown> {
    const path = process.env['ELASTIC_CLOUD_ADMIN_API'] === 'true'
      ? params.path.replace('/api/v1/serverless/', '/api/v1/admin/serverless/')
      : params.path
    let url = `${this.baseUrl}${path}`

    if (params.querystring != null && Object.keys(params.querystring).length > 0) {
      const pieces = Object.entries(params.querystring)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      url += `?${pieces}`
    }

    const headers: Record<string, string> = {
      ...clientHeaders(),
      'Authorization': `ApiKey ${this.apiKey}`,
      'Accept': 'application/json',
    }

    const init: RequestInit = { method: params.method, headers, redirect: 'error' }

    if (params.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(params.body)
    }

    const response = await this._fetch(url, init)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Cloud API error ${response.status}: ${text}`)
    }

    const text = await response.text()
    return text.length > 0 ? JSON.parse(text) : {}
  }

  /**
   * @internal test seam — replaces the fetch implementation for unit tests
   */
  _testSetFetch(fn: typeof fetch): void {
    this._fetch = fn
  }
}

let _client: CloudClient | undefined

/**
 * Returns a lazily-created, cached `CloudClient` configured from the
 * resolved config context's `cloud` service block.
 *
 * @throws {Error} with `missing_config` when no Cloud service is configured
 */
export function getCloudClient(): CloudClient {
  if (_client != null) return _client

  const config = getResolvedConfig()
  const cloud = config?.context.cloud

  if (cloud == null) {
    throw new Error(
      'missing_config: No Cloud connection configured in the active context. ' +
      'Run `elastic config set` to configure a Cloud endpoint.'
    )
  }

  const { url, auth } = cloud
  const authRecord = auth as Record<string, unknown>

  const apiKey = typeof authRecord['api_key'] === 'string' ? authRecord['api_key'] : undefined

  if (apiKey == null) {
    throw new Error(
      'missing_config: Cloud auth requires an api_key. ' +
      'Run `elastic config set` to configure Cloud credentials.'
    )
  }

  _client = new CloudClient(url, apiKey)
  return _client
}

/**
 * Resets the cached CloudClient instance.
 *
 * @internal test seam — call in `afterEach` to prevent instance reuse across tests
 */
export function _testResetCloudClient(): void {
  _client = undefined
}
