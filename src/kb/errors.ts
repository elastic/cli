/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory.ts'
import { toErrorPayload } from '../lib/error-payload.ts'

export { missingConfigError, inputError } from '../lib/error-payload.ts'

/** Builds a structured error payload from a thrown Kibana client error. */
export function kibanaApiError (err: unknown): JsonValue {
  return toErrorPayload(err, 'kibana_api_error')
}
