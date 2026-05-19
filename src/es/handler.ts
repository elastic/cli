/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsClient } from '../lib/es-client.ts'
import type { EsApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import { buildRequestParams } from './request-builder.ts'
import { getEsClient } from '../lib/es-client.ts'
import { missingConfigError, transportError } from './errors.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Dependencies for `createEsHandler`, injectable for testing.
 * Production code uses the defaults; tests supply stubs.
 */
export interface EsHandlerDeps {
  /** returns the active EsClient instance, or throws `missing_config` */
  getEsClient: () => EsClient
  /** builds EsRequestParams from a definition, parsed CLI input, and schema args */
  buildRequestParams: typeof buildRequestParams
}

const defaultDeps: EsHandlerDeps = { getEsClient, buildRequestParams }

/**
 * Creates a handler function for an Elasticsearch API command.
 * Transport and config errors are returned as structured payloads per `contracts/api-definition.md`.
 */
export function createEsHandler (
  def: EsApiDefinition,
  schemaArgs: SchemaArgDefinition[],
  deps: EsHandlerDeps = defaultDeps
): (parsed: ParsedResult) => Promise<JsonValue> {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    const params = deps.buildRequestParams(def, parsed, schemaArgs)

    let transport
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    try {
      const responseType = def.responseType ?? 'json'
      const jsonRequested = parsed.options.json === true

      if (responseType === 'text' && jsonRequested) {
        params.querystring = { ...(params.querystring ?? {}), format: 'json' }
        return await transport.request<JsonValue>(params)
      }

      if (responseType === 'text') {
        return await transport.request<JsonValue>(params, { headers: { 'Accept': 'text/plain' } })
      }

      return await transport.request<JsonValue>(params)
    } catch (err) {
      return transportError(err)
    }
  }
}
