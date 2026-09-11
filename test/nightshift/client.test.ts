/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  converse,
  parseResponse,
  NIGHTSHIFT_AGENT_ID,
} from '../../src/nightshift/client.ts'
import { KibanaClient, getKibanaClient, _testResetKibanaClient } from '../../src/lib/kibana-client.ts'
import { setResolvedConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

const KIBANA_URL = 'http://localhost:5601'
const API_KEY = 'test-key'

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function okResponse (conversationId: string, message: string, steps?: unknown[]): Response {
  return new Response(
    JSON.stringify({
      conversation_id: conversationId,
      response: { message },
      ...(steps !== undefined ? { steps } : {}),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

afterEach(() => {
  _testResetKibanaClient()
  setResolvedConfig({ context: {} } as ResolvedConfig)
})

// ---------------------------------------------------------------------------
// converse() — integration with KibanaClient
// ---------------------------------------------------------------------------

describe('converse', () => {
  function setup () {
    setResolvedConfig({ context: { kibana: { url: KIBANA_URL, auth: { api_key: API_KEY } } } } as unknown as ResolvedConfig)
    const client = getKibanaClient() as KibanaClient
    const requests: Array<{ url: string; init: RequestInit; parsedBody: unknown }> = []
    client._testSetFetch(((url: string, init: RequestInit) => {
      requests.push({ url, init, parsedBody: JSON.parse(init.body as string) })
      return Promise.resolve(okResponse(VALID_UUID, 'Root cause: payments.'))
    }) as unknown as typeof fetch)
    return { client, requests }
  }

  it('POSTs to /api/agent_builder/converse with the nightshift agent id', async () => {
    const { requests } = setup()
    await converse('why is checkout slow?')
    assert.equal(requests.length, 1)
    const req = requests[0]!
    assert.equal(req.url, `${KIBANA_URL}/api/agent_builder/converse`)
    assert.equal((req.parsedBody as Record<string, unknown>)['agent_id'], NIGHTSHIFT_AGENT_ID)
  })

  it('sends required headers: kbn-xsrf, Authorization, Content-Type', async () => {
    const { requests } = setup()
    await converse('hello')
    const headers = requests[0]!.init.headers as Record<string, string>
    assert.equal(headers['kbn-xsrf'], 'true')
    assert.equal(headers['Authorization'], `ApiKey ${API_KEY}`)
    assert.equal(headers['Content-Type'], 'application/json')
  })

  it('uses POST method', async () => {
    const { requests } = setup()
    await converse('hello')
    assert.equal(requests[0]!.init.method?.toUpperCase(), 'POST')
  })

  it('uses redirect: follow (KibanaClient default for same-origin safety)', async () => {
    const { requests } = setup()
    await converse('hello')
    assert.equal(requests[0]!.init.redirect, 'follow')
  })

  it('includes input in the request body', async () => {
    const { requests } = setup()
    await converse('why is checkout slow?')
    assert.equal((requests[0]!.parsedBody as Record<string, unknown>)['input'], 'why is checkout slow?')
  })

  it('omits conversation_id from the body when not supplied', async () => {
    const { requests } = setup()
    await converse('first turn')
    assert.equal('conversation_id' in (requests[0]!.parsedBody as object), false)
  })

  it('includes conversation_id in the body when supplied', async () => {
    const { requests } = setup()
    await converse('follow-up', VALID_UUID)
    assert.equal((requests[0]!.parsedBody as Record<string, unknown>)['conversation_id'], VALID_UUID)
  })

  it('does not alter the request path for adversarial prompt content', async () => {
    const { requests } = setup()
    await converse('../../../etc/passwd?#\ninjected')
    assert.equal(requests[0]!.url, `${KIBANA_URL}/api/agent_builder/converse`)
  })

  it('returns the conversation id and message from the response', async () => {
    setup()
    const answer = await converse('query')
    assert.equal(answer.conversationId, VALID_UUID)
    assert.equal(answer.message, 'Root cause: payments.')
  })

  it('returns steps count when response includes a steps array', async () => {
    setResolvedConfig({ context: { kibana: { url: KIBANA_URL, auth: { api_key: API_KEY } } } } as unknown as ResolvedConfig)
    const client = getKibanaClient() as KibanaClient
    client._testSetFetch((() =>
      Promise.resolve(okResponse(VALID_UUID, 'Answer.', [{ tool: 'search' }, { tool: 'lookup' }]))
    ) as unknown as typeof fetch)
    const answer = await converse('query')
    assert.equal(answer.steps, 2)
  })

  it('returns undefined steps when response has no steps field', async () => {
    setup()
    const answer = await converse('query')
    assert.equal(answer.steps, undefined)
  })

  it('forwards an AbortSignal when timeoutSeconds is supplied', async () => {
    setResolvedConfig({ context: { kibana: { url: KIBANA_URL, auth: { api_key: API_KEY } } } } as unknown as ResolvedConfig)
    const client = getKibanaClient() as KibanaClient
    let capturedSignal: AbortSignal | null | undefined = null
    client._testSetFetch(((url: string, init: RequestInit) => {
      capturedSignal = init.signal ?? null
      return Promise.resolve(okResponse(VALID_UUID, 'ok'))
    }) as unknown as typeof fetch)
    await converse('hello', undefined, 60)
    assert.ok(capturedSignal instanceof AbortSignal, 'expected an AbortSignal to be passed to fetch')
  })

  it('throws on a 403 response', async () => {
    setResolvedConfig({ context: { kibana: { url: KIBANA_URL, auth: { api_key: API_KEY } } } } as unknown as ResolvedConfig)
    const client = getKibanaClient() as KibanaClient
    client._testSetFetch((() =>
      Promise.resolve(new Response('Enterprise license required.', { status: 403 }))
    ) as unknown as typeof fetch)
    await assert.rejects(() => converse('hello'), /Kibana API error 403/)
  })

  it('throws on a 404 response', async () => {
    setResolvedConfig({ context: { kibana: { url: KIBANA_URL, auth: { api_key: API_KEY } } } } as unknown as ResolvedConfig)
    const client = getKibanaClient() as KibanaClient
    client._testSetFetch((() =>
      Promise.resolve(new Response('Agent not found', { status: 404 }))
    ) as unknown as typeof fetch)
    await assert.rejects(() => converse('hello'), /Kibana API error 404/)
  })
})

// ---------------------------------------------------------------------------
// parseResponse() — response shape narrowing
// ---------------------------------------------------------------------------

describe('parseResponse', () => {
  it('parses a valid response', () => {
    const result = parseResponse({
      conversation_id: VALID_UUID,
      response: { message: 'Root cause: payments service.' },
    })
    assert.equal(result.conversationId, VALID_UUID)
    assert.equal(result.message, 'Root cause: payments service.')
    assert.equal(result.steps, undefined)
  })

  it('parses steps as the length of the steps array', () => {
    const result = parseResponse({
      conversation_id: VALID_UUID,
      response: { message: 'ok' },
      steps: [{ tool: 'a' }, { tool: 'b' }, { tool: 'c' }],
    })
    assert.equal(result.steps, 3)
  })

  it('treats a non-array steps field as undefined', () => {
    const result = parseResponse({
      conversation_id: VALID_UUID,
      response: { message: 'ok' },
      steps: 'not-an-array',
    })
    assert.equal(result.steps, undefined)
  })

  it('throws when conversation_id is missing', () => {
    assert.throws(
      () => parseResponse({ response: { message: 'hello' } }),
      /conversation_id/,
    )
  })

  it('throws when conversation_id is not a string', () => {
    assert.throws(
      () => parseResponse({ conversation_id: 42, response: { message: 'hello' } }),
      /conversation_id/,
    )
  })

  it('throws when response key is missing', () => {
    assert.throws(
      () => parseResponse({ conversation_id: VALID_UUID }),
      /response\.response/,
    )
  })

  it('throws when response is not an object', () => {
    assert.throws(
      () => parseResponse({ conversation_id: VALID_UUID, response: 'bad' }),
      /not an object/,
    )
  })

  it('throws when response.message is not a string', () => {
    assert.throws(
      () => parseResponse({ conversation_id: VALID_UUID, response: { message: 42 } }),
      /response\.message/,
    )
  })

  it('throws when response.message is missing', () => {
    assert.throws(
      () => parseResponse({ conversation_id: VALID_UUID, response: {} }),
      /response\.message/,
    )
  })

  it('throws for an empty object', () => {
    assert.throws(() => parseResponse({}), /conversation_id/)
  })

  it('throws for a non-object (string)', () => {
    assert.throws(() => parseResponse('hello'), /not an object/)
  })

  it('throws for null', () => {
    assert.throws(() => parseResponse(null), /not an object/)
  })

  it('throws for an array', () => {
    assert.throws(() => parseResponse([1, 2]), /not an object/)
  })
})
