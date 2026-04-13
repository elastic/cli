/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { errors } from '@elastic/transport'
import type { JsonValue } from '../factory.ts'

/** Builds a `missing_config` error payload from a thrown error. */
export function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

/** Builds a structured error payload from a thrown transport error. */
export function transportError (err: unknown): JsonValue {
  if (err instanceof errors.ResponseError) {
    return {
      error: {
        code: 'transport_error',
        status_code: err.statusCode ?? null,
        body: err.body as JsonValue ?? null
      }
    }
  }

  if (err instanceof errors.ConnectionError) {
    return { error: { code: 'connection_error', message: connectionMessage(err) } }
  }

  if (err instanceof errors.TimeoutError) {
    const message = err.message || 'request timed out'
    return { error: { code: 'timeout_error', message } }
  }

  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'transport_error', message } }
}

function connectionMessage (err: errors.ConnectionError): string {
  const reason = err.message || 'connection failed'
  // err.meta is DiagnosticResult; .meta.connection is the nested transport metadata
  const url = err.meta?.meta?.connection?.url?.toString()
  return url ? `${reason} (${url})` : reason
}
