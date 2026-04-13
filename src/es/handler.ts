/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from '@elastic/transport'
import type { EsApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import { buildRequestParams } from './request-builder.ts'
import { getTransport } from '../lib/transport.ts'
import { missingConfigError, transportError } from './errors.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Dependencies for `createEsHandler`, injectable for testing.
 * Production code uses the defaults; tests supply stubs.
 */
export interface EsHandlerDeps {
  /** returns the active Transport instance, or throws `missing_config` */
  getTransport: () => Transport
  /** builds TransportRequestParams from a definition, parsed CLI input, and schema args */
  buildRequestParams: typeof buildRequestParams
}

const defaultDeps: EsHandlerDeps = { getTransport, buildRequestParams }

/**
 * Creates a handler function for an Elasticsearch API command.
 *
 * The returned handler is bound to `def` and `schemaArgs` at registration time and called
 * by the factory with the validated `ParsedResult` on each invocation. It:
 *
 * 1. Calls `buildRequestParams(def, parsed, schemaArgs)` to assemble the transport request,
 *    routing each parameter by its `found_in` metadata.
 * 2. Calls `getTransport()` to obtain the cached transport instance (throws `missing_config`
 *    if no Elasticsearch is configured -- caught and returned as a structured error).
 * 3. Calls `transport.request(params)` and handles the response based on `def.responseType`:
 *    - `"text"`: returns the raw body string
 *    - `"json"` (default): returns the parsed body object
 * 4. Catches transport errors and returns structured `transport_error` or `missing_config`
 *    payloads per the error contract in `contracts/api-definition.md`.
 *
 * @param def - the API definition to bind this handler to
 * @param schemaArgs - arg definitions extracted from `def.input` at registration time
 * @param deps - injectable dependencies; defaults to production implementations
 * @returns a `(parsed: ParsedResult) => Promise<JsonValue>` handler
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
      transport = deps.getTransport()
    } catch (err) {
      return missingConfigError(err)
    }

    try {
      const responseType = def.responseType ?? 'json'

      if (responseType === 'text') {
        const body = await transport.request<string>(params)
        return body
      } else {
        const body = await transport.request<JsonValue>(params)
        return body
      }
    } catch (err) {
      return transportError(err)
    }
  }
}

/** builds a `missing_config` error payload from a thrown error */
function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

/** builds a structured error payload from a thrown transport error */
function transportError (err: unknown): JsonValue {
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
    const message = err.message ?? 'request timed out'
    return { error: { code: 'timeout_error', message } }
  }

  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'transport_error', message } }
}

function connectionMessage (err: errors.ConnectionError): string {
  const reason = err.message ?? 'connection failed'
  // err.meta is DiagnosticResult; .meta.connection is the nested transport metadata
  const url = err.meta?.meta?.connection?.url?.toString()
  return url ? `${reason} (${url})` : reason
}
