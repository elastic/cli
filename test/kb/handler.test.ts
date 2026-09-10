/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createKbHandler } from '../../src/kb/handler.ts'
import { missingConfigError, kibanaApiError } from '../../src/kb/errors.ts'
import type { KbApiDefinition } from '../../src/kb/types.ts'
import type { KibanaClient, KibanaRequestParams } from '../../src/lib/kibana-client.ts'
import type { ParsedResult } from '../../src/factory.ts'

function listDef (): KbApiDefinition {
  return {
    name: 'get',
    namespace: 'spaces',
    description: 'List spaces',
    method: 'GET',
    path: '/api/spaces/space',
  }
}

function parsed (input?: Record<string, unknown>): ParsedResult {
  return { options: {}, ...(input !== undefined ? { input } : {}) }
}

function stubClient (response: unknown): KibanaClient {
  return { request: async () => response } as unknown as KibanaClient
}

describe('missingConfigError', () => {
  it('wraps an Error message in the expected shape', () => {
    const res = missingConfigError(new Error('no kibana url')) as { error: { code: string; message: string } }
    assert.equal(res.error.code, 'missing_config')
    assert.equal(res.error.message, 'no kibana url')
  })

  it('coerces non-Error values to string', () => {
    const res = missingConfigError('missing context') as { error: { code: string; message: string } }
    assert.equal(res.error.code, 'missing_config')
    assert.equal(res.error.message, 'missing context')
  })
})

describe('kibanaApiError', () => {
  it('extracts status_code from a KibanaClient error message', () => {
    const res = kibanaApiError(new Error('Kibana API error 404: {"message":"not found"}')) as {
      error: { code: string; status_code: number; message: string }
    }
    assert.equal(res.error.code, 'kibana_api_error')
    assert.equal(res.error.status_code, 404)
    assert.match(res.error.message, /not found/)
  })

  it('omits status_code when the message has no status', () => {
    const res = kibanaApiError(new Error('socket hang up')) as { error: { code: string; message: string; status_code?: number } }
    assert.equal(res.error.code, 'kibana_api_error')
    assert.equal(res.error.status_code, undefined)
    assert.equal(res.error.message, 'socket hang up')
  })

  it('coerces non-Error values to string', () => {
    const res = kibanaApiError('raw string error') as { error: { code: string; message: string } }
    assert.equal(res.error.code, 'kibana_api_error')
    assert.equal(res.error.message, 'raw string error')
  })
})

describe('createKbHandler', () => {
  it('returns the API response as JsonValue', async () => {
    const handler = createKbHandler(listDef(), {
      getKibanaClient: () => stubClient({ id: 'default' }),
      buildKibanaRequestParams: () => ({ method: 'GET', path: '/api/spaces/space' }),
    })
    assert.deepEqual(await handler(parsed()), { id: 'default' })
  })

  it('returns missing_config when getKibanaClient throws', async () => {
    const handler = createKbHandler(listDef(), {
      getKibanaClient: () => { throw new Error('no kibana url') },
      buildKibanaRequestParams: () => ({ method: 'GET', path: '/test' }),
    })
    assert.deepEqual(await handler(parsed()), {
      error: { code: 'missing_config', message: 'no kibana url' },
    })
  })

  it('returns kibana_api_error when client.request throws', async () => {
    const handler = createKbHandler(listDef(), {
      getKibanaClient: () => ({
        request: async () => { throw new Error('Kibana API error 403: forbidden') },
      } as unknown as KibanaClient),
      buildKibanaRequestParams: () => ({ method: 'GET', path: '/test' }),
    })
    const result = await handler(parsed()) as { error: { code: string; status_code: number } }
    assert.equal(result.error.code, 'kibana_api_error')
    assert.equal(result.error.status_code, 403)
  })

  it('passes the built request params to client.request', async () => {
    const captured: KibanaRequestParams[] = []
    const handler = createKbHandler(listDef(), {
      getKibanaClient: () => ({
        request: async (params: KibanaRequestParams) => {
          captured.push(params)
          return { ok: true }
        },
      } as unknown as KibanaClient),
      buildKibanaRequestParams: () => ({ method: 'POST', path: '/api/spaces/space', body: { name: 'x' } }),
    })
    await handler(parsed())
    assert.deepEqual(captured, [{ method: 'POST', path: '/api/spaces/space', body: { name: 'x' } }])
  })

  it('forwards definition responseType to client.request (#588)', async () => {
    const captured: Array<string | undefined> = []
    const def: KbApiDefinition = { ...listDef(), name: 'export-list-items', responseType: 'ndjson' }
    const handler = createKbHandler(def, {
      getKibanaClient: () => ({
        request: async (_params: KibanaRequestParams, responseType?: string) => {
          captured.push(responseType)
          return []
        },
      } as unknown as KibanaClient),
      buildKibanaRequestParams: () => ({ method: 'POST', path: '/api/lists/items/_export' }),
    })
    await handler(parsed())
    assert.deepEqual(captured, ['ndjson'])
  })
})
