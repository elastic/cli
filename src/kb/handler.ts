/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import type { KibanaClient } from '../lib/kibana-client.ts'
import { getKibanaClient } from '../lib/kibana-client.ts'
import { buildKibanaRequestParams } from './request-builder.ts'
import { missingConfigError, kibanaApiError } from './errors.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Dependencies for `createKbHandler`, injectable for testing.
 * Production code uses the defaults; tests supply stubs.
 */
export interface KbHandlerDeps {
  /** returns the active KibanaClient instance, or throws `missing_config` */
  getKibanaClient: () => KibanaClient
  /** builds KibanaRequestParams from a definition, parsed CLI input, and schema args */
  buildKibanaRequestParams: typeof buildKibanaRequestParams
}

const defaultDeps: KbHandlerDeps = { getKibanaClient, buildKibanaRequestParams }

/**
 * Creates a handler function for a Kibana API command.
 *
 * The returned handler is bound to `def` and `schemaArgs` at registration time and called
 * by the factory with the validated `ParsedResult` on each invocation. It:
 *
 * 1. Calls `getKibanaClient()` to obtain the cached client (throws `missing_config`
 *    if no Kibana is configured -- caught and returned as a structured error).
 * 2. Calls `buildKibanaRequestParams(def, parsed, schemaArgs)` to assemble the request.
 * 3. Calls `client.request(params)` and returns the parsed JSON response.
 * 4. Catches API errors and returns structured `kibana_api_error` payloads.
 *
 * @param def - the API definition to bind this handler to
 * @param schemaArgs - arg definitions extracted from `def.input` at registration time
 * @param deps - injectable dependencies; defaults to production implementations
 * @returns a `(parsed: ParsedResult) => Promise<JsonValue>` handler
 */
export function createKbHandler (
  def: KbApiDefinition,
  schemaArgs: SchemaArgDefinition[],
  deps: KbHandlerDeps = defaultDeps
): (parsed: ParsedResult) => Promise<JsonValue> {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    let client: KibanaClient
    try {
      client = deps.getKibanaClient()
    } catch (err) {
      return missingConfigError(err)
    }

    const params = deps.buildKibanaRequestParams(def, parsed, schemaArgs)

    try {
      const body = await client.request(params)
      return body as JsonValue
    } catch (err) {
      return kibanaApiError(err)
    }
  }
}
