/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildAuthHeader, type ApiKeyOrBasicAuth } from './auth.ts'
import {
  buildEsQueryString,
  EsConnectionError,
  EsResponseError,
  type EsRequestParams,
  type EsTransport,
} from './es-transport.ts'
import { isLoopbackUrl } from './is-loopback-host.ts'
import { clientHeaders } from './meta.ts'

/** Kibana route that forwards a request to Elasticsearch on the caller's behalf. */
export const CONSOLE_PROXY_PATH = '/api/console/proxy'

/**
 * Kibana reports the real Elasticsearch status here. The outer response is always 200
 * when the proxy itself succeeded, even if Elasticsearch answered 4xx or 5xx.
 */
export const PROXY_STATUS_HEADER = 'x-console-proxy-status-code'

/** Kibana restricts this route to callers that identify as an internal origin. */
export const INTERNAL_ORIGIN_HEADER = 'x-elastic-internal-origin'

/**
 * Headers Kibana requires on every Console proxy call, beyond authentication.
 *
 * Shared so that `elastic status` probes the proxy exactly the way requests travel.
 * Without {@link INTERNAL_ORIGIN_HEADER}, Kibana answers HTTP 400 with a message that
 * reads as though the route were disabled.
 */
export const CONSOLE_PROXY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'kbn-xsrf': 'true',
  [INTERNAL_ORIGIN_HEADER]: 'Kibana',
})

/**
 * Builds the Kibana Console proxy URL for an Elasticsearch request.
 *
 * `target` is the Elasticsearch path including any querystring, already
 * percent-encoded per path parameter. Encoding it again here is deliberate: Kibana
 * decodes the query parameter once, which restores exactly the encoded path
 * Elasticsearch expects. For an index named `my index` that is
 * `/my%20index/_search` → `path=%2Fmy%2520index%2F_search` → Kibana decodes →
 * `/my%20index/_search` → Elasticsearch decodes → `my index`.
 *
 * Percent-encoding is used rather than `URLSearchParams`, which form-encodes a literal
 * space as `+` — a percent-decoder would then read it as `+` instead of a space.
 */
export function consoleProxyUrl (kibanaUrl: string, target: string, method: string): string {
  const base = kibanaUrl.replace(/\/+$/, '')
  const path = encodeURIComponent(target)
  const verb = encodeURIComponent(method.toUpperCase())
  return `${base}${CONSOLE_PROXY_PATH}?path=${path}&method=${verb}`
}

/**
 * Reads the Elasticsearch status code reported by the proxy, falling back to the outer
 * HTTP status when the header is absent or unparseable.
 */
export function proxiedEsStatus (response: Response): number {
  const reported = Number(response.headers.get(PROXY_STATUS_HEADER))
  return Number.isInteger(reported) && reported > 0 ? reported : response.status
}

/**
 * Kibana's reply when {@link INTERNAL_ORIGIN_HEADER} is missing. The wording suggests the
 * route is disabled on the deployment, which is misleading, so it gets an explicit hint.
 */
const ROUTE_RESTRICTED = /not available with the current configuration/i

/**
 * Elasticsearch transport that forwards requests through Kibana's Console proxy.
 *
 * Intended for deployments where Elasticsearch is not reachable from the client but
 * Kibana is — commonly on-prem installs that publish only Kibana. Kibana performs the
 * Elasticsearch call and returns its response body verbatim, so this satisfies the same
 * {@link EsTransport} contract as a direct connection and every `elastic es` command
 * works unchanged.
 *
 * Authentication uses the context's Kibana credentials; there is no separate
 * Elasticsearch endpoint to authenticate against.
 */
export class EsConsoleProxyClient implements EsTransport {
  readonly kibanaUrl: string
  private readonly authHeader: string | undefined
  private _fetch: typeof fetch = globalThis.fetch

  constructor (kibanaUrl: string, auth?: ApiKeyOrBasicAuth) {
    this.kibanaUrl = kibanaUrl.replace(/\/+$/, '')
    this.authHeader = buildAuthHeader(auth)
    if (this.kibanaUrl.startsWith('http://') && !isLoopbackUrl(this.kibanaUrl)) {
      process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
    }
  }

  async request<T = unknown>(
    params: EsRequestParams,
    opts?: { headers?: Record<string, string> }
  ): Promise<T> {
    const url = this.buildProxyUrl(params)

    const headers: Record<string, string> = {
      ...clientHeaders(),
      ...(this.authHeader != null && { 'Authorization': this.authHeader }),
      'Accept': 'application/json',
      ...CONSOLE_PROXY_HEADERS,
    }

    let body: string | undefined
    if (params.bulkBody !== undefined) {
      body = params.bulkBody
      headers['Content-Type'] = 'application/x-ndjson'
    } else if (typeof params.body === 'string') {
      body = params.body
      headers['Content-Type'] = 'application/json'
    } else if (params.body !== undefined) {
      body = JSON.stringify(params.body)
      headers['Content-Type'] = 'application/json'
    }

    if (opts?.headers != null) {
      Object.assign(headers, opts.headers)
    }

    let response: Response
    try {
      response = await this._fetch(url, {
        // The Elasticsearch method travels in the `method` query parameter, so the
        // request to Kibana is always a POST — including for ES GET-with-body searches.
        method: 'POST',
        headers,
        ...(body !== undefined && { body }),
        redirect: 'error',
      })
    } catch (err) {
      throw new EsConnectionError(err instanceof Error ? err.message : String(err))
    }

    // A non-2xx here means Kibana rejected the request, so the Elasticsearch call never
    // happened. Report it as a connection failure rather than an Elasticsearch response.
    if (!response.ok) {
      throw new EsConnectionError(await this.describeProxyFailure(response))
    }

    const esStatus = proxiedEsStatus(response)

    if (params.method.toUpperCase() === 'HEAD') {
      if (esStatus < 400) return true as T
      if (esStatus === 404) return false as T
    }

    const payload = await this.parseBody(response)

    if (esStatus >= 400) {
      throw new EsResponseError(esStatus, payload)
    }

    return payload as T
  }

  /** Combines the Elasticsearch path and querystring into a single proxy target. */
  private buildProxyUrl (params: EsRequestParams): string {
    const queryString = buildEsQueryString(params.querystring)
    const target = queryString.length > 0 ? `${params.path}?${queryString}` : params.path
    return consoleProxyUrl(this.kibanaUrl, target, params.method)
  }

  /** Parses a proxied Elasticsearch response body, mirroring a direct connection. */
  private async parseBody (response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    if (text.length === 0) return {}
    if (contentType.includes('application/json') || contentType.includes('application/x-ndjson')) {
      try {
        return JSON.parse(text)
      } catch {
        // Kibana labelled it JSON but sent something else (e.g. an HTML error page from
        // an intermediate proxy). Surface the payload instead of a parser error.
        return text
      }
    }
    return text
  }

  /** Describes a Kibana-level failure, adding a hint for the misleading restricted-route reply. */
  private async describeProxyFailure (response: Response): Promise<string> {
    let detail: string
    try {
      detail = (await response.text()).trim()
    } catch {
      detail = ''
    }

    const url = `${this.kibanaUrl}${CONSOLE_PROXY_PATH}`
    let message = `Kibana rejected the Elasticsearch request (HTTP ${response.status}) at ${url}`
    if (detail.length > 0) message += `: ${detail}`

    if (response.status === 400 && ROUTE_RESTRICTED.test(detail)) {
      message += `\n\nHint: Kibana restricts ${CONSOLE_PROXY_PATH} to internal callers. ` +
        `This CLI sends the required ${INTERNAL_ORIGIN_HEADER} header, so this usually means ` +
        'the deployment disables the Console proxy (console.ui.enabled: false) or an ' +
        'intermediate proxy strips the header.'
    }
    if (response.status === 401 || response.status === 403) {
      message += '\n\nHint: these are the kibana credentials from your config; ' +
        'the API key must be allowed to use the Console proxy.'
    }

    return message
  }

  /** @internal test seam — replaces the fetch implementation for unit tests */
  _testSetFetch (fn: typeof fetch): void {
    this._fetch = fn
  }
}
