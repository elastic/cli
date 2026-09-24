/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory.ts'
import { withAuthHint } from '../config/next-command.ts'

/** Builds a `missing_config` error payload from a thrown error. */
export function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

/**
 * Builds a structured error payload from a thrown Kibana API error.
 *
 * Extracts the HTTP status code from the error message when present
 * (errors thrown by `KibanaClient.request` follow the pattern
 * `"Kibana API error <status>: <body>"`).
 */
export function kibanaApiError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  const match = /Kibana API error (\d+):/.exec(message)
  if (match != null) {
    const status_code = parseInt(match[1]!, 10)
    return {
      error: {
        code: 'kibana_api_error',
        status_code,
        message: withAuthHint(message, status_code),
      },
    }
  }
  return { error: { code: 'kibana_api_error', message } }
}
