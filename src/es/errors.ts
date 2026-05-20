/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EsResponseError, EsConnectionError } from '../lib/es-client.ts'
import type { JsonValue } from '../factory.ts'

/** Builds a `missing_config` error payload from a thrown error. */
export function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

const TLS_HINTS = [
  /SSL routines/i,
  /wrong version number/i,
  /ssl3_get_record/i,
  /tls_get_more_records/i,
  /packet length too long/i,
  /EPROTO/i,
  /ERR_SSL/i,
]

function isTlsError (message: string): boolean {
  return TLS_HINTS.some((re) => re.test(message))
}

function appendTlsHint (message: string): string {
  if (isTlsError(message)) {
    return message + '\n\nHint: this looks like a TLS/SSL error. If your Elasticsearch is running on plain HTTP, change the url in your config from https:// to http://.'
  }
  return message
}

/** Builds a structured error payload from a thrown transport error. */
export function transportError (err: unknown): JsonValue {
  if (err instanceof EsResponseError) {
    return {
      error: {
        code: 'transport_error',
        status_code: err.statusCode,
        body: err.body as JsonValue ?? null
      }
    }
  }

  if (err instanceof EsConnectionError) {
    const message = err.message || 'connection failed'
    return { error: { code: 'connection_error', message: appendTlsHint(message) } }
  }

  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'transport_error', message: appendTlsHint(message) } }
}
