/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { buildCloudRequestParams } from '../../src/cloud/request-builder.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'
import type { ParsedResult } from '../../src/factory.ts'

function parsed(input?: Record<string, unknown>): ParsedResult {
  return { options: {}, ...(input !== undefined ? { input } : {}) }
}

describe('buildCloudRequestParams', () => {
  it('returns method and path for a simple GET', () => {
    const def: CloudApiDefinition = {
      name: 'list',
      namespace: 'deployments',
      description: 'List deployments',
      method: 'GET',
      path: '/api/v1/deployments',
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.method, 'GET')
    assert.equal(result.path, '/api/v1/deployments')
    assert.equal(result.querystring, undefined)
    assert.equal(result.body, undefined)
  })

  it('interpolates required path params', () => {
    const def: CloudApiDefinition = {
      name: 'get',
      namespace: 'deployments',
      description: 'Get deployment',
      method: 'GET',
      path: '/api/v1/deployments/{deployment_id}',
      pathParams: [{ name: 'deployment_id', description: 'ID', required: true }],
    }
    const result = buildCloudRequestParams(def, parsed({ deployment_id: 'abc-123' }))
    assert.equal(result.path, '/api/v1/deployments/abc-123')
  })

  it('strips optional path params when absent', () => {
    const def: CloudApiDefinition = {
      name: 'get',
      namespace: 'deployments',
      description: 'Get deployment',
      method: 'GET',
      path: '/api/v1/deployments/{deployment_id}',
      pathParams: [{ name: 'deployment_id', description: 'ID', required: false }],
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.path, '/api/v1/deployments')
  })

  it('builds querystring from query params present in input', () => {
    const def: CloudApiDefinition = {
      name: 'list',
      namespace: 'deployments',
      description: 'List deployments',
      method: 'GET',
      path: '/api/v1/deployments',
      queryParams: [
        { name: 'show_metadata', type: 'boolean', description: 'Include metadata' },
        { name: 'limit', type: 'number', description: 'Max results' },
      ],
    }
    const result = buildCloudRequestParams(def, parsed({ show_metadata: true, limit: 10 }))
    assert.deepEqual(result.querystring, { show_metadata: 'true', limit: '10' })
  })

  it('omits query params not present in input', () => {
    const def: CloudApiDefinition = {
      name: 'list',
      namespace: 'deployments',
      description: 'List',
      method: 'GET',
      path: '/api/v1/deployments',
      queryParams: [
        { name: 'show_metadata', type: 'boolean', description: 'Include metadata' },
      ],
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.querystring, undefined)
  })

  it('uses cliFlag as input key when provided on query param', () => {
    const def: CloudApiDefinition = {
      name: 'list',
      namespace: 'deployments',
      description: 'List',
      method: 'GET',
      path: '/api/v1/deployments',
      queryParams: [
        { name: 'show_metadata', cliFlag: 'show-metadata', type: 'boolean', description: 'Meta' },
      ],
    }
    const result = buildCloudRequestParams(def, parsed({ 'show-metadata': true }))
    assert.deepEqual(result.querystring, { show_metadata: 'true' })
  })

  it('collects body fields from input', () => {
    const def: CloudApiDefinition = {
      name: 'create',
      namespace: 'deployments',
      description: 'Create deployment',
      method: 'POST',
      path: '/api/v1/deployments',
      body: z.object({ name: z.string(), region: z.string() }),
    }
    const result = buildCloudRequestParams(def, parsed({ name: 'my-deploy', region: 'us-east-1' }))
    assert.deepEqual(result.body, { name: 'my-deploy', region: 'us-east-1' })
  })

  it('returns undefined body when no body fields are in input', () => {
    const def: CloudApiDefinition = {
      name: 'create',
      namespace: 'deployments',
      description: 'Create',
      method: 'POST',
      path: '/api/v1/deployments',
      body: z.object({ name: z.string() }),
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.body, undefined)
  })

  it('separates path, query, and body params from the same input', () => {
    const def: CloudApiDefinition = {
      name: 'update',
      namespace: 'deployments',
      description: 'Update deployment',
      method: 'PUT',
      path: '/api/v1/deployments/{deployment_id}',
      pathParams: [{ name: 'deployment_id', description: 'ID', required: true }],
      queryParams: [{ name: 'validate_only', type: 'boolean', description: 'Dry run' }],
      body: z.object({ name: z.string() }),
    }
    const result = buildCloudRequestParams(def, parsed({
      deployment_id: 'abc',
      validate_only: true,
      name: 'new-name',
    }))
    assert.equal(result.path, '/api/v1/deployments/abc')
    assert.deepEqual(result.querystring, { validate_only: 'true' })
    assert.deepEqual(result.body, { name: 'new-name' })
  })
})
