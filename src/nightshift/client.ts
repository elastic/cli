/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nightshift investigation agent client.
 *
 * Wraps the agent builder converse endpoint, hardcoded to the Nightshift
 * investigation agent. This is the only file that needs to change when the
 * server-side `POST /api/nightshift/ask` endpoint is built — the command
 * layer (`ask.ts`) is stable.
 *
 * Endpoint: POST /api/agent_builder/converse (public, access: 'public',
 * elastic-api-version optional on single-version public routes).
 */

import { getKibanaClient } from '../lib/kibana-client.ts'

/**
 * Agent id of the Nightshift Investigator, as defined in
 * `x-pack/platform/plugins/shared/nightshift_investigations/server/agents/investigation/index.ts`.
 */
export const NIGHTSHIFT_AGENT_ID = 'significant-events.investigation'

const CONVERSE_PATH = '/api/agent_builder/converse'

/** The meaningful part of a converse response, stripped of verbose step/metric fields. */
export interface NightshiftAnswer {
  conversationId: string
  message: string
}

/**
 * Sends one turn to the Nightshift investigation agent via the agent builder
 * converse endpoint and returns the prose answer.
 *
 * On the first turn, omit `conversationId` and the server creates a new
 * conversation. Pass the returned `conversationId` on subsequent turns to
 * continue the same conversation thread.
 *
 * @throws {Error} when Kibana is not configured, the request fails, or the
 *   response shape is unexpected (fields missing or wrong type).
 */
export async function converse (
  prompt: string,
  conversationId?: string,
): Promise<NightshiftAnswer> {
  const client = getKibanaClient()

  const body: Record<string, unknown> = {
    agent_id: NIGHTSHIFT_AGENT_ID,
    input: prompt,
  }
  if (conversationId !== undefined) {
    body['conversation_id'] = conversationId
  }

  const raw = await client.request({ method: 'POST', path: CONVERSE_PATH, body })

  return parseResponse(raw)
}

/**
 * Narrows the raw `unknown` response to `NightshiftAnswer`.
 * Throws with a descriptive message rather than silently returning `undefined`
 * when the shape does not match, so the caller can surface a structured error.
 *
 * @internal exported for testing
 */
export function parseResponse (raw: unknown): NightshiftAnswer {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('nightshift_api_error: unexpected response shape (not an object)')
  }

  const resp = raw as Record<string, unknown>

  const conversationId = resp['conversation_id']
  if (typeof conversationId !== 'string') {
    throw new Error('nightshift_api_error: response missing string conversation_id')
  }

  const response = resp['response']
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('nightshift_api_error: response.response is not an object')
  }

  const message = (response as Record<string, unknown>)['message']
  if (typeof message !== 'string') {
    throw new Error('nightshift_api_error: response.response.message is not a string')
  }

  return { conversationId, message }
}
