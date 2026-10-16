/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory.ts'
import { AUTH_FAILURE_HINT } from '../output.ts'
import { ConnectionError, HttpResponseError } from '../lib/http-errors.ts'
import { transportError } from '../es/errors.ts'

/** Builds a `missing_config` error payload from a thrown error. */
export function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

/** Builds an `input_error` error payload from a thrown error. */
export function inputError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'input_error', message } }
}

/** Builds a structured error payload from a thrown Kibana API error. */
export function kibanaApiError (err: unknown): JsonValue {
  if (err instanceof ConnectionError) return transportError(err)
  const message = err instanceof Error ? err.message : String(err)
  const status = err instanceof HttpResponseError ? err.statusCode : undefined
  const error: Record<string, JsonValue> = { code: 'kibana_api_error', message }
  if (status != null) error.status_code = status
  if (status === 401 || status === 403) error.hint = AUTH_FAILURE_HINT
  return { error }
}
