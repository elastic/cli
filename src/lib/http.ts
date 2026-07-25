/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory-core.ts'

const REDACTED_HEADERS = new Set([
  'authentication-info',
  'authorization',
  'cookie',
  'proxy-authenticate',
  'proxy-authentication-info',
  'proxy-authorization',
  'set-cookie',
  'www-authenticate',
  'x-api-key',
])

/**
 * Per-request behavior for {@link apiFetch}.
 */
export interface FetchOptions {
  debug?: boolean
}

let cliDebugEnabled = false
let jsonDebugMode = false
const bufferedDebugStatements: string[] = []

/**
 * Enables or disables HTTP debugging for the current CLI process.
 */
export function setHttpDebugEnabled (enabled: boolean): void {
  cliDebugEnabled = enabled
}

/**
 * Returns whether HTTP debug output is enabled by CLI flag or environment.
 */
export function isHttpDebugEnabled (): boolean {
  return cliDebugEnabled || process.env['ELASTIC_DEBUG'] === '1'
}

/**
 * Buffers HTTP diagnostics for structured output instead of writing to stderr.
 */
export function setHttpDebugJsonMode (enabled: boolean): void {
  jsonDebugMode = enabled
  bufferedDebugStatements.length = 0
}

function writeDebugStatement (statement: string): void {
  if (jsonDebugMode) {
    bufferedDebugStatements.push(statement)
  } else {
    process.stderr.write(`${statement}\n`)
  }
}

function writeHeaders (prefix: string, headers: RequestInit['headers']): void {
  for (const [name, value] of new Headers(headers)) {
    const printableValue = REDACTED_HEADERS.has(name.toLowerCase()) ? '(redacted)' : value
    writeDebugStatement(`${prefix} ${name}: ${printableValue}`)
  }
}

/**
 * Adds buffered HTTP diagnostics to a structured command result and clears the buffer.
 *
 * Object results keep their existing top-level shape. Primitive, array, or
 * pre-existing `debug` results are wrapped under `result` to avoid data loss.
 */
export function attachHttpDebug (value: JsonValue): JsonValue {
  const debug = bufferedDebugStatements.splice(0)
  if (debug.length === 0) return value

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'debug')) {
    return { ...value, debug }
  }
  return { result: value, debug }
}

/**
 * Executes an API request with optional request and response diagnostics.
 *
 * Credential-bearing headers are redacted case-insensitively. In text mode,
 * diagnostics go to stderr. In JSON mode, they are buffered for
 * {@link attachHttpDebug}. The response is cloned before inspection so callers
 * can consume the original body.
 */
export async function apiFetch (
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  options: FetchOptions = {}
): Promise<Response> {
  if (options.debug !== true) {
    return fetchImplementation(url, init)
  }

  writeDebugStatement(`> ${init.method ?? 'GET'} ${url}`)
  writeHeaders('>', init.headers)
  if (typeof init.body === 'string') {
    writeDebugStatement(init.body)
  }

  let response: Response
  try {
    response = await fetchImplementation(url, init)
  } catch (error) {
    writeDebugStatement(`< Request failed: ${String(error)}`)
    throw error
  }

  const statusText = response.statusText.length > 0 ? ` ${response.statusText}` : ''
  writeDebugStatement(`< ${response.status}${statusText}`)
  writeHeaders('<', response.headers)

  try {
    const body = await response.clone().text()
    if (body.length > 0) {
      writeDebugStatement(body)
    }
  } catch (error) {
    writeDebugStatement(`< Response body unavailable: ${String(error)}`)
  }

  return response
}
