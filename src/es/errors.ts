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

/** Builds a `transport_error` payload from a thrown transport error. */
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

  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'transport_error', message } }
}
