/**
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

  it('returns transport_error with message for non-ResponseError transport errors', async () => {
    const deps = makeDeps({
      getTransport: () => ({
        request: async () => { throw new errors.ConnectionError('Connection refused') },
      } as unknown as Transport),
    })

    const handler = createEsHandler(makeDef(), [], deps)
    const result = await handler(parsedInput()) as Record<string, unknown>

    const err = result['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.ok(typeof err['message'] === 'string')
    assert.equal(err['status_code'], undefined)
  })
})
