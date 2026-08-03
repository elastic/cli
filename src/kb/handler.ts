/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import { validateKbApiDefinition } from './types.ts'
import type { KibanaClient } from '../lib/kibana-client.ts'
import { getKibanaClient } from '../lib/kibana-client.ts'
import { buildKibanaRequestParams } from './request-builder.ts'
import { missingConfigError, kibanaApiError } from './errors.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Dependencies for `createKbHandler`, injectable for testing.
 */
export interface KbHandlerDeps {
  getKibanaClient: () => KibanaClient
  buildKibanaRequestParams: typeof buildKibanaRequestParams
}

const defaultDeps: KbHandlerDeps = { getKibanaClient, buildKibanaRequestParams }

/**
 * Creates a handler function for a Kibana API command.
 *
 * The returned handler:
 * 1. Obtains the cached `KibanaClient` (or returns `missing_config` error)
 * 2. Builds request params from the definition and parsed input
 * 3. Sends the request and returns the JSON response
 * 4. Catches API errors and returns structured error payloads
 */
export function createKbHandler (
  def: KbApiDefinition,
  deps: KbHandlerDeps = defaultDeps
): (parsed: ParsedResult) => Promise<JsonValue> {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    try {
      validateKbApiDefinition(def)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: { code: 'invalid_definition', message } }
    }

    let client: KibanaClient
    try {
      client = deps.getKibanaClient()
    } catch (err) {
      return missingConfigError(err)
    }

    const params = deps.buildKibanaRequestParams(def, parsed)

    try {
      const body = await client.request(params)
      return body as JsonValue
    } catch (err) {
      return kibanaApiError(err)
    }
  }
}
