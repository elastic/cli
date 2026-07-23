/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const REDACTED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
])

let cliDebugEnabled = false

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

function writeHeaders (prefix: string, headers: RequestInit['headers']): void {
  for (const [name, value] of new Headers(headers)) {
    const printableValue = REDACTED_HEADERS.has(name.toLowerCase()) ? '(redacted)' : value
    process.stderr.write(`${prefix} ${name}: ${printableValue}\n`)
  }
}

/**
 * Executes a fetch call and writes opt-in request and response diagnostics to stderr.
 *
 * Credential-bearing headers are redacted case-insensitively. The response is
 * cloned before its body is inspected so callers can consume the original body.
 */
export async function fetchWithHttpDebug (
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  if (!isHttpDebugEnabled()) {
    return fetchImplementation(url, init)
  }

  process.stderr.write(`> ${init.method ?? 'GET'} ${url}\n`)
  writeHeaders('>', init.headers)
  if (typeof init.body === 'string') {
    process.stderr.write(`\n${init.body}\n`)
  }

  let response: Response
  try {
    response = await fetchImplementation(url, init)
  } catch (error) {
    process.stderr.write(`< Request failed: ${String(error)}\n`)
    throw error
  }

  const statusText = response.statusText.length > 0 ? ` ${response.statusText}` : ''
  process.stderr.write(`< ${response.status}${statusText}\n`)
  writeHeaders('<', response.headers)

  try {
    const body = await response.clone().text()
    if (body.length > 0) {
      process.stderr.write(`\n${body}\n`)
    }
  } catch (error) {
    process.stderr.write(`< Response body unavailable: ${String(error)}\n`)
  }

  return response
}
