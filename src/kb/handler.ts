/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import type { KibanaClient } from '../lib/kibana-client.ts'
import { getKibanaClient } from '../lib/kibana-client.ts'
import { buildKibanaRequestParams } from './request-builder.ts'
import { extractSchemaArgs } from '../lib/json-schema-args.ts'
import { missingConfigError, kibanaApiError, inputError } from './errors.ts'
import type { HandlerResult, ParsedResult } from '../factory.ts'

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
 * Routing args are extracted from `def.input` once, when the handler is created at
 * registration. The returned handler:
 * 1. Builds request params from the definition and parsed input (or returns `input_error`)
 * 2. Obtains the cached `KibanaClient` (or returns `missing_config` error)
 * 3. Sends the request and returns the JSON response
 * 4. Catches API errors and returns structured error payloads
 */
export function createKbHandler (
  def: KbApiDefinition,
  deps: KbHandlerDeps = defaultDeps
): (parsed: ParsedResult) => Promise<HandlerResult> {
  const schemaArgs = extractSchemaArgs(def.input)
  return async (parsed: ParsedResult): Promise<HandlerResult> => {
    let params
    try {
      params = deps.buildKibanaRequestParams(def, parsed, schemaArgs)
    } catch (err) {
      if ((err as { code?: string }).code === 'input_error') return inputError(err)
      throw err
    }

    let client: KibanaClient
    try {
      client = deps.getKibanaClient()
    } catch (err) {
      return missingConfigError(err)
    }

    try {
      const body = await client.request(params, def.responseType)
      return body as HandlerResult
    } catch (err) {
      return kibanaApiError(err)
    }
  }
}
