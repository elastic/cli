/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EsClient, EsResponseError, EsConnectionError } from '../../src/lib/es-client.ts'
import type { EsRequestParams } from '../../src/lib/es-client.ts'
import type { EsApiDefinition } from '../../src/es/types.ts'
import { createEsHandler } from '../../src/es/handler.ts'
import type { EsHandlerDeps } from '../../src/es/handler.ts'
import type { ParsedResult } from '../../src/factory.ts'

function makeDef(overrides: Partial<EsApiDefinition> = {}): EsApiDefinition {
  return {
    name: 'health',
    namespace: 'cat',
    description: 'Returns cluster health',
    method: 'GET',
    path: '/_cat/health',
    responseType: 'text',
    ...overrides,
  }
}

function parsedInput(
  input: Record<string, unknown> = {},
  options: Record<string, string | number | boolean> = {},
): ParsedResult {
  return { options, input }
}

const BUILT_PARAMS: EsRequestParams = { method: 'GET', path: '/_cat/health' }

/** makes a deps stub with sensible defaults overridable per-test */
function makeDeps(overrides: Partial<EsHandlerDeps> = {}): EsHandlerDeps {
  return {
    buildRequestParams: () => BUILT_PARAMS,
    getEsClient: () => ({ request: async () => 'ok' } as unknown as EsClient),
    ...overrides,
  }
}

/**
 * Wraps `fn` and records every call's arguments.
 * Used instead of `t.mock.fn()` which is not implemented in Bun.
 */
function spy<T extends (...args: never[]) => unknown>(fn: T): T & { calls: Parameters<T>[] } {
  const calls: Parameters<T>[] = []
  const wrapper = ((...args: Parameters<T>) => {
    calls.push(args)
    return fn(...args)
  }) as T & { calls: Parameters<T>[] }
  wrapper.calls = calls
  return wrapper
}

describe('createEsHandler', () => {
  it('calls buildRequestParams with the definition and parsed input', async () => {
    const def = makeDef()
    const parsed = parsedInput()
    const buildSpy = spy(() => BUILT_PARAMS)
    const deps = makeDeps({ buildRequestParams: buildSpy as EsHandlerDeps['buildRequestParams'] })

    const handler = createEsHandler(def, [], deps)
    await handler(parsed)

    assert.equal(buildSpy.calls.length, 1)
    assert.equal(buildSpy.calls[0]?.[0], def)
    assert.equal(buildSpy.calls[0]?.[1], parsed)
  })

  it('calls transport.request() with the params from buildRequestParams', async () => {
    const requestSpy = spy(async () => 'green\n')
    const deps = makeDeps({
      getEsClient: () => ({ request: requestSpy } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    await handler(parsedInput())

    assert.equal(requestSpy.calls.length, 1)
    assert.deepEqual(requestSpy.calls[0]?.[0], BUILT_PARAMS)
  })

  it('returns raw body string for responseType: text', async () => {
    const deps = makeDeps({
      getEsClient: () => ({ request: async () => 'green\n' } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput())
    assert.equal(result, 'green\n')
  })

  it('returns parsed body object for responseType: json', async () => {
    const responseBody = { status: 'green', number_of_nodes: 3 }
    const deps = makeDeps({
      getEsClient: () => ({ request: async () => responseBody } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef({ responseType: 'json' }), [], deps)
    const result = await handler(parsedInput())
    assert.deepEqual(result, responseBody)
  })

  it('defaults to json responseType when responseType is omitted', async () => {
    const responseBody = { status: 'green' }
    const deps = makeDeps({
      getEsClient: () => ({ request: async () => responseBody } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef({ responseType: undefined }), [], deps)
    const result = await handler(parsedInput())
    assert.deepEqual(result, responseBody)
  })

  it('returns structured missing_config error when getEsClient throws', async () => {
    const deps = makeDeps({
      getEsClient: () => {
        throw new Error('missing_config: No Elasticsearch connection configured in the active context.')
      },
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'missing_config')
    assert.ok(typeof err['message'] === 'string')
    assert.match(err['message'] as string, /missing_config/)
  })

  it('returns transport_error with status code and ES body for EsResponseError', async () => {
    const esErrorBody = { error: { type: 'index_not_found_exception', reason: 'no such index' }, status: 404 }
    const responseError = new EsResponseError(404, esErrorBody)
    const deps = makeDeps({
      getEsClient: () => ({
        request: async () => { throw responseError },
      } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['status_code'], 404)
    assert.deepEqual(err['body'], esErrorBody)
  })

  it('returns connection_error for EsConnectionError', async () => {
    const deps = makeDeps({
      getEsClient: () => ({
        request: async () => { throw new EsConnectionError('Connection refused') },
      } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.equal(err['message'], 'Connection refused')
  })

  it('returns connection_error with fallback message for empty EsConnectionError', async () => {
    const deps = makeDeps({
      getEsClient: () => ({
        request: async () => { throw new EsConnectionError('') },
      } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.ok((err['message'] as string).length > 0)
  })

  it('returns transport_error with message for generic errors', async () => {
    const deps = makeDeps({
      getEsClient: () => ({
        request: async () => { throw new Error('something unexpected') },
      } as unknown as EsClient),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['message'], 'something unexpected')
  })

  it('injects format=json and parses as JSON when --json is active with responseType: text (#88)', async () => {
    const capturedParams: EsRequestParams[] = []
    const jsonBody = [{ alias: '.kibana', index: '.kibana_1' }]
    const deps = makeDeps({
      getEsClient: () => ({
        request: async (params: EsRequestParams) => {
          capturedParams.push(params)
          return jsonBody
        },
      } as unknown as EsClient),
      buildRequestParams: () => ({ method: 'GET', path: '/_cat/aliases' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput({}, { json: true }))

    assert.deepEqual(result, jsonBody)
    assert.equal((capturedParams[0]?.querystring as Record<string, unknown>)?.format, 'json')
  })

  it('sends Accept: text/plain when --json is not active with responseType: text', async () => {
    const capturedOpts: Array<{ headers?: Record<string, string> }> = []
    const deps = makeDeps({
      getEsClient: () => ({
        request: async (_params: EsRequestParams, opts?: { headers?: Record<string, string> }) => {
          capturedOpts.push(opts ?? {})
          return 'green\n'
        },
      } as unknown as EsClient),
      buildRequestParams: () => ({ method: 'GET', path: '/_cat/health' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput())

    assert.equal(result, 'green\n')
    assert.equal(capturedOpts[0]?.headers?.['Accept'], 'text/plain')
  })

  it('does not inject format=json for responseType: json even with --json', async () => {
    const capturedParams: EsRequestParams[] = []
    const jsonBody = { status: 'green' }
    const deps = makeDeps({
      getEsClient: () => ({
        request: async (params: EsRequestParams) => {
          capturedParams.push(params)
          return jsonBody
        },
      } as unknown as EsClient),
      buildRequestParams: () => ({ method: 'GET', path: '/_cluster/health' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'json' }), [], deps)
    const result = await handler(parsedInput({}, { json: true }))

    assert.deepEqual(result, jsonBody)
    assert.equal(capturedParams[0]?.querystring, undefined)
  })
})
