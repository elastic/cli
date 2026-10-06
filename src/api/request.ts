/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResolvedConfig } from '../config/types.ts'
import { buildAuthHeader } from '../lib/auth.ts'
import { EsConnectionError, EsResponseError } from '../lib/es-client.ts'
import { isLoopbackUrl } from '../lib/is-loopback-host.ts'
import { clientHeaders } from '../lib/meta.ts'
import { encodeApiPath } from './path.ts'

export const API_SERVICES = ['es', 'kb', 'cloud'] as const
export type ApiService = (typeof API_SERVICES)[number]

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'])

export interface ResolvedApiRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  redirect: 'error'
}

export interface BuildApiRequestArgs {
  method: string
  path: string
  service: string
  extraHeaders?: readonly string[]
  body?: unknown
  config: ResolvedConfig | undefined
}

let _fetchImpl: typeof fetch = globalThis.fetch

/** @internal test seam */
export function _testSetFetch (fn: typeof fetch): () => void {
  const prev = _fetchImpl
  _fetchImpl = fn
  return () => { _fetchImpl = prev }
}

function inputError (message: string): never {
  throw Object.assign(new Error(message), { code: 'input_error' })
}

function parseService (raw: string): ApiService {
  if ((API_SERVICES as readonly string[]).includes(raw)) return raw as ApiService
  inputError(`service must be es, kb, or cloud, got "${raw}"`)
}

function parseMethod (raw: string): string {
  const method = raw.trim().toUpperCase()
  if (!METHODS.has(method)) {
    inputError(`method must be GET, POST, PUT, DELETE, HEAD, or PATCH, got "${raw}"`)
  }
  return method
}

function parseHeader (raw: string): [string, string] {
  const colon = raw.indexOf(':')
  if (colon <= 0) inputError(`invalid header "${raw}": expected Name: value`)
  const name = raw.slice(0, colon).trim()
  const value = raw.slice(colon + 1).trim()
  if (name === '') inputError(`invalid header "${raw}": expected Name: value`)
  return [name, value]
}

function serviceBlock (service: ApiService, config: ResolvedConfig | undefined) {
  const context = config?.context
  if (service === 'es') {
    const block = context?.elasticsearch
    if (block == null) {
      throw new Error(
        'missing_config: No Elasticsearch connection configured in the active context. ' +
        'Add an elasticsearch block to your .elasticrc.yml config file.'
      )
    }
    return block
  }
  if (service === 'kb') {
    const block = context?.kibana
    if (block == null) {
      throw new Error(
        'missing_config: No Kibana connection configured in the active context. ' +
        'Add a kibana block to your .elasticrc.yml config file.'
      )
    }
    return block
  }
  const block = context?.cloud
  if (block == null) {
    throw new Error(
      'missing_config: No Cloud connection configured in the active context. ' +
      'Run `elastic config context add` with `--cloud-api-key`.'
    )
  }
  if (block.auth == null || !('api_key' in block.auth)) {
    throw new Error(
      'missing_config: Cloud auth requires an api_key. ' +
      'Run `elastic config context add` with `--cloud-api-key`.'
    )
  }
  return block
}

/**
 * Returns a copy of `req` with any Authorization header (regardless of
 * capitalisation) replaced by a redacted placeholder so it is safe to print
 * during `--dry-run`.
 */
export function redactRequest (req: ResolvedApiRequest): ResolvedApiRequest {
  const headers = { ...req.headers }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'authorization') {
      const scheme = headers[key].split(' ')[0] ?? 'ApiKey'
      headers[key] = `${scheme} ***`
    }
  }
  return { ...req, headers }
}

export function buildApiRequest (args: BuildApiRequestArgs): ResolvedApiRequest {
  const method = parseMethod(args.method)
  const service = parseService(args.service)
  const block = serviceBlock(service, args.config)
  const { pathname, query } = encodeApiPath(args.path)

  const baseUrl = block.url.replace(/\/+$/, '')
  if (baseUrl.startsWith('http://') && !isLoopbackUrl(baseUrl)) {
    process.stderr.write('Warning: using plaintext HTTP. Credentials will be sent unencrypted.\n')
  }

  let url = `${baseUrl}${pathname}`
  if (query.length > 0) {
    const pieces = query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    url += `?${pieces.join('&')}`
  }

  const headers: Record<string, string> = {
    ...clientHeaders(),
    'Accept': 'application/json',
  }
  const authHeader = buildAuthHeader(block.auth)
  if (authHeader != null) headers['Authorization'] = authHeader
  if (service === 'kb' && method !== 'GET' && method !== 'HEAD') {
    headers['kbn-xsrf'] = 'true'
  }

  for (const raw of args.extraHeaders ?? []) {
    const [name, value] = parseHeader(raw)
    headers[name] = value
  }

  const resolved: ResolvedApiRequest = { method, url, headers, redirect: 'error' }
  if (args.body !== undefined) {
    resolved.body = typeof args.body === 'string' ? args.body : JSON.stringify(args.body)
    if (headers['Content-Type'] == null && headers['content-type'] == null) {
      headers['Content-Type'] = 'application/json'
    }
  }
  return resolved
}

export async function sendApiRequest (req: ResolvedApiRequest): Promise<unknown> {
  let response: Response
  try {
    response = await _fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body !== undefined && { body: req.body }),
      redirect: 'error',
    })
  } catch (err) {
    throw new EsConnectionError(err instanceof Error ? err.message : String(err))
  }

  if (req.method === 'HEAD') {
    if (response.ok) return true
    if (response.status === 404) return false
  }

  const text = await response.text()
  let parsed: unknown
  if (text.length === 0) parsed = {}
  else {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }

  if (!response.ok) throw new EsResponseError(response.status, parsed)
  return parsed
}
