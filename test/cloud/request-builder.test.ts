/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
      destructive: false,
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
      destructive: false,
      input: {
        type: 'object',
        properties: { deployment_id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
        required: ['deployment_id'],
      },
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
      destructive: false,
      input: {
        type: 'object',
        properties: { deployment_id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
      },
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
      destructive: false,
      input: {
        type: 'object',
        properties: {
          show_metadata: { type: 'boolean', description: 'Include metadata', 'x-found-in': 'query' },
          limit: { type: 'number', description: 'Max results', 'x-found-in': 'query' },
        },
      },
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
      destructive: false,
      input: {
        type: 'object',
        properties: {
          show_metadata: { type: 'boolean', description: 'Include metadata', 'x-found-in': 'query' },
        },
      },
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.querystring, undefined)
  })

  it('collects body fields from input', () => {
    const def: CloudApiDefinition = {
      name: 'create',
      namespace: 'deployments',
      description: 'Create deployment',
      method: 'POST',
      path: '/api/v1/deployments',
      destructive: false,
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name', 'x-found-in': 'body' },
          region: { type: 'string', description: 'Region', 'x-found-in': 'body' },
        },
        required: ['name', 'region'],
      },
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
      destructive: false,
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name', 'x-found-in': 'body' },
        },
      },
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
      destructive: true,
      input: {
        type: 'object',
        properties: {
          deployment_id: { type: 'string', description: 'ID', 'x-found-in': 'path' },
          validate_only: { type: 'boolean', description: 'Dry run', 'x-found-in': 'query' },
          name: { type: 'string', description: 'Name', 'x-found-in': 'body' },
        },
        required: ['deployment_id'],
      },
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

  it('encodes path params to prevent path traversal (#106)', () => {
    const def: CloudApiDefinition = {
      name: 'get',
      namespace: 'deployments',
      description: 'Get deployment',
      method: 'GET',
      path: '/api/v1/deployments/{deployment_id}',
      destructive: false,
      input: {
        type: 'object',
        properties: { deployment_id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
        required: ['deployment_id'],
      },
    }
    const result = buildCloudRequestParams(def, parsed({ deployment_id: '../../../secret?#' }))
    assert.ok(!result.path.includes('../'), 'dot-dot-slash must be encoded')
    assert.ok(!result.path.includes('?'), 'question mark must be encoded')
    assert.ok(!result.path.includes('#'), 'hash must be encoded')
    assert.equal(result.path, '/api/v1/deployments/..%2F..%2F..%2Fsecret%3F%23')
  })

  it('forwards stdin body for POST commands without explicit body schema (#86)', () => {
    const def: CloudApiDefinition = {
      name: 'create-elasticsearch-project',
      namespace: 'elasticsearch-projects',
      description: 'Create',
      method: 'POST',
      path: '/api/v1/serverless/projects/elasticsearch',
      destructive: false,
    }
    const result = buildCloudRequestParams(def, parsed({ name: 'demo', region_id: 'aws-us-east-1' }))
    assert.deepEqual(result.body, { name: 'demo', region_id: 'aws-us-east-1' })
  })

  it('excludes path and query params from passthrough body (#86)', () => {
    const def: CloudApiDefinition = {
      name: 'patch-project',
      namespace: 'elasticsearch-projects',
      description: 'Patch',
      method: 'PATCH',
      path: '/api/v1/serverless/projects/elasticsearch/{id}',
      destructive: true,
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID', 'x-found-in': 'path' },
          dry_run: { type: 'boolean', description: 'Dry run', 'x-found-in': 'query' },
          name: { type: 'string', description: 'Name', 'x-found-in': 'body' },
        },
        required: ['id'],
      },
    }
    const result = buildCloudRequestParams(def, parsed({ id: 'abc', dry_run: true, name: 'new-name' }))
    assert.deepEqual(result.body, { name: 'new-name' }, 'path and query params should not be in body')
    assert.equal(result.path, '/api/v1/serverless/projects/elasticsearch/abc')
    assert.deepEqual(result.querystring, { dry_run: 'true' })
  })

  it('does not create body for GET commands without explicit schema', () => {
    const def: CloudApiDefinition = {
      name: 'list',
      namespace: 'deployments',
      description: 'List',
      method: 'GET',
      path: '/api/v1/deployments',
      destructive: false,
    }
    const result = buildCloudRequestParams(def, parsed({ extra: 'value' }))
    assert.equal(result.body, undefined)
  })

  it('does not create body for DELETE commands without explicit schema', () => {
    const def: CloudApiDefinition = {
      name: 'delete',
      namespace: 'deployments',
      description: 'Delete',
      method: 'DELETE',
      path: '/api/v1/deployments/{id}',
      destructive: true,
      input: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
        required: ['id'],
      },
    }
    const result = buildCloudRequestParams(def, parsed({ id: 'abc', extra: 'value' }))
    assert.equal(result.body, undefined)
  })
})

describe('buildCloudRequestParams required path param handling (BUG C regression)', () => {
  it('throws naming the missing param instead of silently truncating the URL, for a real definition', async () => {
    const { loadCloudApis } = await import('../../src/cloud/apis.ts')
    const defs = await loadCloudApis()
    const def = defs.find((d) => d.namespace === 'deployments' && d.name === 'get-deployment')
    assert.ok(def != null, 'expected get-deployment to exist in the manifest')
    assert.deepEqual((def.input as { required?: string[] }).required, ['deployment_id'])

    assert.throws(
      () => buildCloudRequestParams(def, parsed({})),
      /deployment_id/,
    )
  })

  it('still strips an optional path param when absent (construction case, unaffected by the fix)', () => {
    const def: CloudApiDefinition = {
      name: 'get',
      namespace: 'deployments',
      description: 'Get deployment',
      method: 'GET',
      path: '/api/v1/deployments/{deployment_id}',
      destructive: false,
      input: {
        type: 'object',
        properties: { deployment_id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
      },
    }
    const result = buildCloudRequestParams(def, parsed())
    assert.equal(result.path, '/api/v1/deployments')
  })
})
