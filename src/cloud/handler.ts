/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import type { CloudClient } from '../lib/cloud-client.ts'
import { getCloudClient } from '../lib/cloud-client.ts'
import { buildCloudRequestParams } from './request-builder.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

const DEFAULT_POLL_INTERVAL_MS = 10_000
const DEFAULT_POLL_TIMEOUT_MS = 300_000

/**
 * Dependencies for `createCloudHandler`. 
 */
export interface CloudHandlerDeps {
  getCloudClient: () => CloudClient
  buildCloudRequestParams: typeof buildCloudRequestParams
  pollIntervalMs?: number
  pollTimeoutMs?: number
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

      if (parsed.options.wait === true && isCreateProjectCommand(def.name)) {
        const id = (body as Record<string, unknown>)?.id as string | undefined
        if (id != null) {
          const statusPath = `${def.path}/${id}/status`
          await pollProjectStatus(client, statusPath, deps)
          process.stderr.write(`Project ${id} is ready.\n`)
        }
      }

      return body as JsonValue
    } catch (err) {
      return cloudApiError(err)
    }
  }
}

const CREATE_PROJECT_RE = /^create-(?:elasticsearch|observability|security)-project$/

export function isCreateProjectCommand (name: string): boolean {
  return CREATE_PROJECT_RE.test(name)
}

async function pollProjectStatus (
  client: CloudClient,
  statusPath: string,
  deps: CloudHandlerDeps
): Promise<void> {
  const interval = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timeout = deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const start = Date.now()

  while (Date.now() - start < timeout) {
    await sleep(interval)
    try {
      const status = await client.request({ method: 'GET', path: statusPath }) as Record<string, unknown>
      if (status.phase === 'initialized') return
      process.stderr.write(`Waiting for project... phase: ${status.phase ?? 'unknown'}\n`)
    } catch {
      process.stderr.write('Waiting for project... (status check failed, retrying)\n')
    }
  }
  throw new Error('Timed out waiting for project to reach "initialized" phase')
}

function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function missingConfigError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

function cloudApiError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'cloud_api_error', message } }
}
