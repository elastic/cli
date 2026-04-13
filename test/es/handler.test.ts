/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { errors } from '@elastic/transport'
import type { Transport, TransportRequestParams } from '@elastic/transport'
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

const BUILT_PARAMS: TransportRequestParams = { method: 'GET', path: '/_cat/health' }

/** makes a deps stub with sensible defaults overridable per-test */
function makeDeps(overrides: Partial<EsHandlerDeps> = {}): EsHandlerDeps {
  return {
    buildRequestParams: () => BUILT_PARAMS,
    getTransport: () => ({ request: async () => 'ok' } as unknown as Transport),
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

function makeDiagnostic (url: string) {
  return {
    body: null,
    statusCode: null,
    headers: {},
    warnings: null,
    meta: {
      context: null, name: 'test', attempts: 1, aborted: false,
      request: { params: { method: 'GET', path: '/' }, options: {}, id: 1 },
      connection: { url: new URL(url) },
    },
  }
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
      getTransport: () => ({ request: requestSpy } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    await handler(parsedInput())

    assert.equal(requestSpy.calls.length, 1)
    assert.deepEqual(requestSpy.calls[0]?.[0], BUILT_PARAMS)
  })

  it('returns raw body string for responseType: text', async () => {
    const deps = makeDeps({
      getTransport: () => ({ request: async () => 'green\n' } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput())
    assert.equal(result, 'green\n')
  })

  it('returns parsed body object for responseType: json', async () => {
    const responseBody = { status: 'green', number_of_nodes: 3 }
    const deps = makeDeps({
      getTransport: () => ({ request: async () => responseBody } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef({ responseType: 'json' }), [], deps)
    const result = await handler(parsedInput())
    assert.deepEqual(result, responseBody)
  })

  it('defaults to json responseType when responseType is omitted', async () => {
    const responseBody = { status: 'green' }
    const deps = makeDeps({
      getTransport: () => ({ request: async () => responseBody } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef({ responseType: undefined }), [], deps)
    const result = await handler(parsedInput())
    assert.deepEqual(result, responseBody)
  })

  it('returns structured missing_config error when getTransport throws', async () => {
    const deps = makeDeps({
      getTransport: () => {
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

  it('returns transport_error with status code and ES body for ResponseError', async () => {
    const esErrorBody = { error: { type: 'index_not_found_exception', reason: 'no such index' }, status: 404 }
    const diagResult = {
      body: esErrorBody,
      statusCode: 404,
      headers: {},
      warnings: null,
      meta: {
        context: null, name: 'test', attempts: 1, aborted: false,
        request: { params: { method: 'GET', path: '/' }, options: {}, id: 1 },
        connection: null,
      },
    }
    const responseError = new errors.ResponseError(diagResult as never)
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw responseError },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['status_code'], 404)
    assert.deepEqual(err['body'], esErrorBody)
  })

  it('returns connection_error with message for ConnectionError with non-empty message', async () => {
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw new errors.ConnectionError('Connection refused') },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.equal(err['message'], 'Connection refused')
  })

  it('returns connection_error with URL from meta when message is empty', async () => {
    const connErr = new errors.ConnectionError('', makeDiagnostic('http://localhost:19999') as never)
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw connErr },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.equal(err['message'], 'connection failed (http://localhost:19999/)')
  })

  it('includes both message and URL when ConnectionError has both', async () => {
    const connErr = new errors.ConnectionError('Connection refused', makeDiagnostic('http://localhost:19999') as never)
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw connErr },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.equal(err['message'], 'Connection refused (http://localhost:19999/)')
  })

  it('returns connection_error with fallback message when both message and cause are empty', async () => {
    const connErr = new errors.ConnectionError('')
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw connErr },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'connection_error')
    assert.ok((err['message'] as string).length > 0, 'message should not be empty')
  })

  it('returns timeout_error for TimeoutError', async () => {
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw new errors.TimeoutError('Request timed out') },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'timeout_error')
    assert.equal(err['message'], 'Request timed out')
  })

  it('returns transport_error with message for non-ResponseError non-ConnectionError errors', async () => {
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw new Error('something unexpected') },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['message'], 'something unexpected')
  })

  it('injects format=json and parses as JSON when --json is active with responseType: text (#88)', async () => {
    const capturedParams: TransportRequestParams[] = []
    const jsonBody = [{ alias: '.kibana', index: '.kibana_1' }]
    const deps = makeDeps({
      getTransport: () => ({
        request: async (params: TransportRequestParams) => {
          capturedParams.push(params)
          return jsonBody
        },
      } as unknown as Transport),
      buildRequestParams: () => ({ method: 'GET', path: '/_cat/aliases' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput({}, { json: true }))

    assert.deepEqual(result, jsonBody)
    assert.equal((capturedParams[0]?.querystring as Record<string, unknown>)?.format, 'json')
  })

  it('does not inject format=json when --json is not active with responseType: text', async () => {
    const capturedParams: TransportRequestParams[] = []
    const deps = makeDeps({
      getTransport: () => ({
        request: async (params: TransportRequestParams) => {
          capturedParams.push(params)
          return 'green\n'
        },
      } as unknown as Transport),
      buildRequestParams: () => ({ method: 'GET', path: '/_cat/health' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'text' }), [], deps)
    const result = await handler(parsedInput())

    assert.equal(result, 'green\n')
    assert.equal(capturedParams[0]?.querystring, undefined)
  })

  it('does not inject format=json for responseType: json even with --json', async () => {
    const capturedParams: TransportRequestParams[] = []
    const jsonBody = { status: 'green' }
    const deps = makeDeps({
      getTransport: () => ({
        request: async (params: TransportRequestParams) => {
          capturedParams.push(params)
          return jsonBody
        },
      } as unknown as Transport),
      buildRequestParams: () => ({ method: 'GET', path: '/_cluster/health' }),
    })

    const handler = createEsHandler(makeDef({ responseType: 'json' }), [], deps)
    const result = await handler(parsedInput({}, { json: true }))

    assert.deepEqual(result, jsonBody)
    assert.equal(capturedParams[0]?.querystring, undefined)
  })
})
