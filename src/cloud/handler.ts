/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import type { CloudClient } from '../lib/cloud-client.ts'
import { getCloudClient } from '../lib/cloud-client.ts'
import { buildCloudRequestParams } from './request-builder.ts'
import type { HandlerResult, JsonValue, ParsedResult } from '../factory.ts'

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
): (parsed: ParsedResult) => Promise<HandlerResult> {
  return async (parsed: ParsedResult): Promise<HandlerResult> => {
    let client: CloudClient
    try {
      client = deps.getCloudClient()
    } catch (err) {
      return missingConfigError(err)
    }

    let params: ReturnType<typeof deps.buildCloudRequestParams>
    try {
      params = deps.buildCloudRequestParams(def, parsed)
    } catch (err) {
      if ((err as { code?: string }).code === 'input_error') return inputError(err)
      return invalidRequestError(err)
    }

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

      if (isEmptyListBody(body)) {
        const hint = emptyListCreateHint(def)
        if (hint != null) process.stderr.write(`${hint}\n`)
      }
      return body as HandlerResult
    } catch (err) {
      return cloudApiError(err, def)
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

function inputError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'input_error', message } }
}

function missingConfigError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

const REGION_HINT = 'Run `elastic cloud serverless regions list-regions`.'
const CLOUD_AUTH_HINT = 'Use a Cloud API key, not a project Elasticsearch key. Create one at https://cloud.elastic.co/account/keys, then run `elastic config context edit`.'

function parseErrorsMessage (bodyText: string): string | undefined {
  try {
    const json = JSON.parse(bodyText) as { errors?: Array<{ message?: unknown }> }
    if (!Array.isArray(json.errors)) return undefined
    const msgs = json.errors
      .map((e) => (typeof e?.message === 'string' ? e.message : undefined))
      .filter((m): m is string => m != null)
    return msgs.length > 0 ? msgs.join('; ') : undefined
  } catch {
    return undefined
  }
}

function parseCloudError (raw: string): { status?: number; message: string } {
  const match = /Cloud API error (\d+): ([\s\S]*)$/.exec(raw)
  if (match == null) return { message: raw }
  const status = parseInt(match[1]!, 10)
  const bodyText = match[2] ?? ''
  return { status, message: parseErrorsMessage(bodyText) ?? raw }
}

function listHint (def: CloudApiDefinition): string | undefined {
  switch (def.namespace) {
    case 'elasticsearch-projects': return 'Run `elastic cloud serverless projects search list`.'
    case 'observability-projects': return 'Run `elastic cloud serverless projects observability list`.'
    case 'security-projects': return 'Run `elastic cloud serverless projects security list`.'
    case 'deployments': return 'Run `elastic cloud hosted deployments list-deployments`.'
    default: return undefined
  }
}

function emptyListCreateHint (def: CloudApiDefinition): string | undefined {
  switch (def.name) {
    case 'list-elasticsearch-projects': return 'No projects yet. Create one with `elastic cloud serverless projects search create`.'
    case 'list-observability-projects': return 'No projects yet. Create one with `elastic cloud serverless projects observability create`.'
    case 'list-security-projects': return 'No projects yet. Create one with `elastic cloud serverless projects security create`.'
    case 'list-deployments': return 'No deployments yet. Create one with `elastic cloud hosted deployments create-deployment`.'
    default: return undefined
  }
}

function isEmptyListBody (body: unknown): boolean {
  if (Array.isArray(body) && body.length === 0) return true
  if (body != null && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>
    if (Array.isArray(o.items) && o.items.length === 0) return true
    if (Array.isArray(o.deployments) && o.deployments.length === 0) return true
  }
  return false
}

function cloudHint (def: CloudApiDefinition, status: number | undefined, message: string): string | undefined {
  if (status === 401 || status === 403) return CLOUD_AUTH_HINT
  if (status === 404) return listHint(def)
  if (/region/i.test(message)) return REGION_HINT
  if (status === 400 && isCreateProjectCommand(def.name)) return REGION_HINT
  return undefined
}

function cloudApiError (err: unknown, def: CloudApiDefinition): JsonValue {
  const raw = err instanceof Error ? err.message : String(err)
  const { status, message } = parseCloudError(raw)
  const error: Record<string, JsonValue> = { code: 'cloud_api_error', message }
  const hint = cloudHint(def, status, message)
  if (hint != null) error.hint = hint
  return { error }
}

function invalidRequestError(err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'invalid_request', message } }
}
