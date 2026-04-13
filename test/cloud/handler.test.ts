/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCloudHandler, isCreateProjectCommand } from '../../src/cloud/handler.ts'
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

function createEsProjectDef(): CloudApiDefinition {
  return {
    name: 'create-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Create an Elasticsearch project',
    method: 'POST',
    path: '/api/v1/serverless/projects/elasticsearch',
  }
}

function parsed(input?: Record<string, unknown>, options: Record<string, unknown> = {}): ParsedResult {
  return { options, ...(input !== undefined ? { input } : {}) }
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

describe('isCreateProjectCommand', () => {
  it('matches all three project types', () => {
    assert.ok(isCreateProjectCommand('create-elasticsearch-project'))
    assert.ok(isCreateProjectCommand('create-observability-project'))
    assert.ok(isCreateProjectCommand('create-security-project'))
  })

  it('does not match other commands', () => {
    assert.ok(!isCreateProjectCommand('list-elasticsearch-projects'))
    assert.ok(!isCreateProjectCommand('delete-elasticsearch-project'))
    assert.ok(!isCreateProjectCommand('create'))
  })
})

describe('--wait polling (#91)', () => {
  it('polls status endpoint until initialized when --wait is set', async () => {
    let pollCount = 0
    const client = {
      baseUrl: 'https://api.elastic-cloud.com',
      request: async (params: CloudRequestParams) => {
        if (params.method === 'POST') {
          return { id: 'proj-123', name: 'demo' }
        }
        pollCount++
        if (pollCount < 3) return { phase: 'initializing' }
        return { phase: 'initialized' }
      },
      _testSetFetch: () => {},
    } as unknown as CloudClient

    const handler = createCloudHandler(createEsProjectDef(), {
      getCloudClient: () => client,
      buildCloudRequestParams: () => ({ method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' }),
      pollIntervalMs: 10,
      pollTimeoutMs: 5000,
    })

    const result = await handler(parsed(undefined, { wait: true }))
    assert.deepEqual(result, { id: 'proj-123', name: 'demo' })
    assert.equal(pollCount, 3)
  })

  it('does not poll when --wait is not set', async () => {
    let pollCount = 0
    const client = {
      baseUrl: 'https://api.elastic-cloud.com',
      request: async (params: CloudRequestParams) => {
        if (params.method === 'POST') return { id: 'proj-123' }
        pollCount++
        return { phase: 'initialized' }
      },
      _testSetFetch: () => {},
    } as unknown as CloudClient

    const handler = createCloudHandler(createEsProjectDef(), {
      getCloudClient: () => client,
      buildCloudRequestParams: () => ({ method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' }),
      pollIntervalMs: 10,
    })

    await handler(parsed())
    assert.equal(pollCount, 0, 'should not poll without --wait')
  })

  it('returns cloud_api_error on poll timeout', async () => {
    const client = {
      baseUrl: 'https://api.elastic-cloud.com',
      request: async (params: CloudRequestParams) => {
        if (params.method === 'POST') return { id: 'proj-123' }
        return { phase: 'initializing' }
      },
      _testSetFetch: () => {},
    } as unknown as CloudClient

    const handler = createCloudHandler(createEsProjectDef(), {
      getCloudClient: () => client,
      buildCloudRequestParams: () => ({ method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' }),
      pollIntervalMs: 10,
      pollTimeoutMs: 50,
    })

    const result = await handler(parsed(undefined, { wait: true })) as { error: { message: string } }
    assert.ok(result.error.message.includes('Timed out'))
  })
})
