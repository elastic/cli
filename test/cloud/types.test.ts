/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateCloudApiDefinition } from '../../src/cloud/types.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

function validDef(overrides: Partial<CloudApiDefinition> = {}): CloudApiDefinition {
  return {
    name: 'list',
    namespace: 'deployments',
    description: 'List all deployments',
    method: 'GET',
    path: '/api/v1/deployments',
    ...overrides,
  }
}

describe('validateCloudApiDefinition', () => {
  describe('valid definitions', () => {
    it('accepts a minimal valid definition', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef()))
    })

    it('accepts a definition with path params', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({
        name: 'get',
        path: '/api/v1/deployments/{deployment_id}',
        pathParams: [{ name: 'deployment_id', description: 'Deployment ID', required: true }],
      })))
    })

    it('accepts a definition with query params', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({
        queryParams: [{ name: 'show_metadata', type: 'boolean', description: 'Include metadata' }],
      })))
    })
  })

  describe('name validation', () => {
    it('rejects empty name', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({ name: '' })), /invalid name/)
    })

    it('rejects name with uppercase', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({ name: 'List' })), /invalid name/)
    })

    it('accepts hyphenated name', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({ name: 'get-status' })))
    })
  })

  describe('namespace validation', () => {
    it('rejects empty namespace', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({ namespace: '' })), /invalid namespace/)
    })

    it('rejects namespace starting with digit', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({ namespace: '1bad' })), /invalid namespace/)
    })

    it('accepts hyphenated namespace', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({ namespace: 'es-projects' })))
    })
  })

  describe('path validation', () => {
    it('rejects path not starting with /', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({ path: 'api/v1/foo' })), /must start with/)
    })
  })

  describe('path param validation', () => {
    it('rejects path token without matching pathParam', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/deployments/{id}',
        pathParams: [],
      })), /not defined in pathParams/)
    })

    it('rejects required pathParam missing from path template', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/deployments',
        pathParams: [{ name: 'id', description: 'ID', required: true }],
      })), /not in path template/)
    })
  })

  describe('schema key collision detection', () => {
    it('rejects duplicate keys across path and query params', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/{name}',
        pathParams: [{ name: 'name', description: 'Name', required: true }],
        queryParams: [{ name: 'name', type: 'string', description: 'Also name' }],
      })), /collision/)
    })

    it('uses cliFlag for query param collision check when present', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/{name}',
        pathParams: [{ name: 'name', description: 'Name', required: true }],
        queryParams: [{ name: 'name', cliFlag: 'query-name', type: 'string', description: 'Also name' }],
      })))
    })
  })
})
