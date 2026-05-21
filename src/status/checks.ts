/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-service connectivity and authentication probes used by `elastic status`.
 *
 * Each probe is a pure async function over a single `ServiceBlock`. Probes do
 * not throw: every transport, HTTP, or shape failure is reported as a
 * structured `{ ok: false, url, error }` value so the status command can
 * surface every service's state independently.
 */

import type { ServiceBlock } from '../config/types.ts'
import { buildAuthHeader } from '../lib/auth.ts'
import { clientHeaders } from '../lib/meta.ts'

/** Successful Elasticsearch probe. */
export interface EsCheckOk {
  ok: true
  url: string
  status: string
  nodes: number
}

/** Successful Kibana probe. */
export interface KbCheckOk {
  ok: true
  url: string
  status: string
  version: string
}

/** Successful Cloud probe. */
export interface CloudCheckOk {
  ok: true
  url: string
}

/** Failure shape shared across all three probes. */
export interface CheckErr {
  ok: false
  url: string
  error: string
}

export type EsCheck = EsCheckOk | CheckErr
export type KbCheck = KbCheckOk | CheckErr
export type CloudCheck = CloudCheckOk | CheckErr

/** Maps an HTTP status code into a short, user-facing error string. */
function classifyHttp (status: number): string {
  if (status === 401 || status === 403) return `auth failed (${status})`
  return `request failed (${status})`
}

/** Converts a thrown fetch error into a `network error: <reason>` string. */
function classifyNetwork (err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `network error: ${msg}`
}

/**
 * Performs a single GET probe and returns the parsed JSON body, or a classified
 * error string. Used internally by all three service probes.
 */
async function pingService (
  url: string,
  pathSegment: string,
  auth: ServiceBlock['auth'],
  fetchFn: typeof fetch,
): Promise<{ ok: true, body: unknown } | { ok: false, error: string }> {
  const headers: Record<string, string> = {
    ...clientHeaders(),
    'Accept': 'application/json',
  }
  const h = buildAuthHeader(auth)
  if (h != null) headers['Authorization'] = h

  const target = `${url.replace(/\/+$/, '')}${pathSegment}`
  let response: Response
  try {
    response = await fetchFn(target, { method: 'GET', headers, redirect: 'error' })
  } catch (err) {
    return { ok: false, error: classifyNetwork(err) }
  }
  if (!response.ok) return { ok: false, error: classifyHttp(response.status) }

  const text = await response.text()
  if (text.length === 0) return { ok: true, body: {} }
  try {
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: false, error: 'unexpected response' }
  }
}

/**
 * Probes an Elasticsearch service by calling `GET /_cluster/health`.
 *
 * Returns a structured success containing cluster `status` (green / yellow / red)
 * and the `number_of_nodes`, or a classified failure when the request, response,
 * or response shape is invalid.
 */
export async function checkElasticsearch (
  block: ServiceBlock,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<EsCheck> {
  const result = await pingService(block.url, '/_cluster/health', block.auth, fetchFn)
  if (!result.ok) return { ok: false, url: block.url, error: result.error }
  const body = result.body
  if (body == null || typeof body !== 'object') {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  const rec = body as Record<string, unknown>
  const status = rec['status']
  const nodes = rec['number_of_nodes']
  if (typeof status !== 'string' || typeof nodes !== 'number') {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  return { ok: true, url: block.url, status, nodes }
}

/**
 * Probes a Kibana service by calling `GET /api/status`.
 *
 * Reads `status.overall.level` (e.g. `"available"`) and `version.number`.
 * Returns a classified failure when the request fails or the response shape
 * is unexpected.
 */
export async function checkKibana (
  block: ServiceBlock,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<KbCheck> {
  const result = await pingService(block.url, '/api/status', block.auth, fetchFn)
  if (!result.ok) return { ok: false, url: block.url, error: result.error }
  const body = result.body
  if (body == null || typeof body !== 'object') {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  const rec = body as Record<string, unknown>
  const statusObj = rec['status']
  const versionObj = rec['version']
  if (
    statusObj == null || typeof statusObj !== 'object' ||
    versionObj == null || typeof versionObj !== 'object'
  ) {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  const overall = (statusObj as Record<string, unknown>)['overall']
  if (overall == null || typeof overall !== 'object') {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  const level = (overall as Record<string, unknown>)['level']
  const version = (versionObj as Record<string, unknown>)['number']
  if (typeof level !== 'string' || typeof version !== 'string') {
    return { ok: false, url: block.url, error: 'unexpected response' }
  }
  return { ok: true, url: block.url, status: level, version }
}

/**
 * Probes an Elastic Cloud service by calling `GET /api/v1/user`.
 *
 * Cloud auth must be an API key; basic auth or a missing key is reported as a
 * failure without making a request.
 */
export async function checkCloud (
  block: ServiceBlock,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<CloudCheck> {
  if (block.auth == null || !('api_key' in block.auth)) {
    return { ok: false, url: block.url, error: 'cloud requires api_key auth' }
  }
  const result = await pingService(block.url, '/api/v1/user', block.auth, fetchFn)
  if (!result.ok) return { ok: false, url: block.url, error: result.error }
  return { ok: true, url: block.url }
}
