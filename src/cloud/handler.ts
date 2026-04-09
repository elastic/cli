/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import type { CloudClient } from '../lib/cloud-client.ts'
import { getCloudClient } from '../lib/cloud-client.ts'
import { buildCloudRequestParams } from './request-builder.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Dependencies for `createCloudHandler`. 
 */
export interface CloudHandlerDeps {
  getCloudClient: () => CloudClient
  buildCloudRequestParams: typeof buildCloudRequestParams
}

const defaultDeps: CloudHandlerDeps = { getCloudClient, buildCloudRequestParams }

/**
 * Creates a handler function for a Cloud control plane API command.
 *
 * The returned handler is bound to `def` at registration time and called by
 * the factory with the validated `ParsedResult` on each invocation. It:
 *
 * 1. Calls `getCloudClient()` to obtain the cached client (throws `missing_config`
 *    if no Cloud service is configured).
 * 2. Calls `buildCloudRequestParams(def, parsed)` to assemble the request.
 * 3. Calls `client.request(params)` and returns the JSON response.
 * 4. Catches errors and returns structured `missing_config` or `cloud_api_error` payloads.
 */
export function createCloudHandler(
  def: CloudApiDefinition,
  deps: CloudHandlerDeps = defaultDeps,
): (parsed: ParsedResult) => Promise<JsonValue> {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    let client: CloudClient
    try {
      client = deps.getCloudClient()
    } catch (err) {
      return missingConfigError(err)
    }

    const params = deps.buildCloudRequestParams(def, parsed)

    try {
      const body = await client.request(params)
      return body as JsonValue
    } catch (err) {
      return cloudApiError(err)
    }
  }
}

function missingConfigError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

function cloudApiError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'cloud_api_error', message } }
}
