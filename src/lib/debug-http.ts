/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface DebugHttpEntry {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  response: Response
}

const REDACTED_HEADERS = new Set(['authorization', 'x-api-key'])
let cliDebugEnabled = false

/**
 * Sets HTTP debug logging from the parsed root CLI option.
 */
export function setHttpDebugEnabled (value: boolean): void {
  cliDebugEnabled = value
}

/**
 * Returns true when HTTP debug logging is enabled by CLI flag or environment.
 */
export function isHttpDebugEnabled (): boolean {
  if (process.env['ELASTIC_DEBUG'] === '1') return true
  return cliDebugEnabled
}

function sanitizeHeaders (headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '(redacted)' : value
  }
  return sanitized
}

/**
 * Writes HTTP request and response debug output to stderr.
 *
 * The response is cloned before reading its body so callers can still consume
 * the original response normally.
 */
export async function logHttpDebug (entry: DebugHttpEntry): Promise<void> {
  if (!isHttpDebugEnabled()) return

  const lines = [
    `Request: ${entry.method} ${entry.url}`,
    'Request headers:',
  ]

  for (const [key, value] of Object.entries(sanitizeHeaders(entry.headers))) {
    lines.push(`${key}: ${value}`)
  }

  if (entry.body !== undefined) {
    lines.push('Request body:', entry.body)
  }

  lines.push(`Response: ${entry.response.status}`)

  try {
    const responseBody = await entry.response.clone().text()
    if (responseBody.length > 0) {
      lines.push('Response body:', responseBody)
    }
  } catch {
    lines.push('Response body: <unavailable>')
  }

  process.stderr.write(`${lines.join('\n')}\n`)
}
