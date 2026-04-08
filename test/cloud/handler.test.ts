/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCloudHandler } from '../../src/cloud/handler.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'
import type { CloudClient, CloudRequestParams } from '../../src/lib/cloud-client.ts'
import type { ParsedResult } from '../../src/factory.ts'

function listDef(): CloudApiDefinition {
  return {
    name: 'list',
    namespace: 'deployments',
    description: 'List deployments',
    method: 'GET',
    path: '/api/v1/deployments',
  }
}

function parsed(input?: Record<string, unknown>): ParsedResult {
  return { options: {}, ...(input !== undefined ? { input } : {}) }
}

function stubClient(response: unknown): CloudClient {
  return {
    baseUrl: 'https://api.elastic-cloud.com',
    request: async () => response,
    _testSetFetch: () => {},
  } as unknown as CloudClient
}

function failingClient(err: Error): CloudClient {
  return {
    baseUrl: 'https://api.elastic-cloud.com',
    request: async () => { throw err },
    _testSetFetch: () => {},
  } as unknown as CloudClient
}

describe('createCloudHandler', () => {
  it('returns the API response as JsonValue', async () => {
    const handler = createCloudHandler(listDef(), {
      getCloudClient: () => stubClient({ deployments: [{ id: 'abc' }] }),
      buildCloudRequestParams: () => ({ method: 'GET', path: '/api/v1/deployments' }),
    })
    const result = await handler(parsed())
    assert.deepEqual(result, { deployments: [{ id: 'abc' }] })
  })

  it('passes the definition and parsed result to buildCloudRequestParams', async () => {
    const captured: { def: CloudApiDefinition; parsed: ParsedResult }[] = []
    const def = listDef()
    const p = parsed({ foo: 'bar' })

    const handler = createCloudHandler(def, {
      getCloudClient: () => stubClient({}),
      buildCloudRequestParams: (d, pr) => {
        captured.push({ def: d, parsed: pr })
        return { method: 'GET', path: '/test' }
      },
    })
    await handler(p)
    assert.equal(captured.length, 1)
    assert.strictEqual(captured[0]!.def, def)
    assert.strictEqual(captured[0]!.parsed, p)
  })

  it('passes the built request params to client.request', async () => {
    const capturedParams: CloudRequestParams[] = []
    const fakeClient = {
      baseUrl: 'https://api.elastic-cloud.com',
      request: async (params: CloudRequestParams) => {
        capturedParams.push(params)
        return { ok: true }
      },
    } as unknown as CloudClient

    const handler = createCloudHandler(listDef(), {
      getCloudClient: () => fakeClient,
      buildCloudRequestParams: () => ({ method: 'POST', path: '/api/v1/test', body: { x: 1 } }),
    })
    await handler(parsed())
    assert.equal(capturedParams.length, 1)
    assert.equal(capturedParams[0]!.method, 'POST')
    assert.equal(capturedParams[0]!.path, '/api/v1/test')
    assert.deepEqual(capturedParams[0]!.body, { x: 1 })
  })

  it('returns a missing_config error when getCloudClient throws', async () => {
    const handler = createCloudHandler(listDef(), {
      getCloudClient: () => { throw new Error('missing_config: No Cloud connection') },
      buildCloudRequestParams: () => ({ method: 'GET', path: '/test' }),
    })
    const result = await handler(parsed())
    assert.deepEqual(result, {
      error: { code: 'missing_config', message: 'missing_config: No Cloud connection' },
    })
  })

  it('returns a cloud_api_error when client.request throws', async () => {
    const handler = createCloudHandler(listDef(), {
      getCloudClient: () => failingClient(new Error('Cloud API error 404: {"errors":[{"message":"not found"}]}')),
      buildCloudRequestParams: () => ({ method: 'GET', path: '/test' }),
    })
    const result = await handler(parsed())
    assert.deepEqual(result, {
      error: { code: 'cloud_api_error', message: 'Cloud API error 404: {"errors":[{"message":"not found"}]}' },
    })
  })
})
