/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateCloudApiDefinition } from '../../src/cloud/types.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

function validDef (overrides: Partial<CloudApiDefinition> = {}): CloudApiDefinition {
  return {
    name: 'list',
    namespace: 'deployments',
    description: 'List all deployments',
    method: 'GET',
    path: '/api/v1/deployments',
    destructive: false,
    ...overrides,
  }
}

describe('validateCloudApiDefinition', () => {
  describe('valid definitions', () => {
    it('accepts a minimal valid definition', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef()))
    })

    it('accepts a definition with path params in input', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({
        name: 'get',
        path: '/api/v1/deployments/{deployment_id}',
        input: {
          type: 'object',
          properties: { deployment_id: { type: 'string', description: 'Deployment ID', 'x-found-in': 'path' } },
          required: ['deployment_id'],
        },
      })))
    })

    it('accepts a definition with query params in input', () => {
      assert.doesNotThrow(() => validateCloudApiDefinition(validDef({
        input: {
          type: 'object',
          properties: { show_metadata: { type: 'boolean', description: 'Include metadata', 'x-found-in': 'query' } },
        },
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
    it('rejects path token without matching x-found-in:path property', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/deployments/{id}',
        input: { type: 'object', properties: {} },
      })), /not defined in input\.properties/)
    })

    it('rejects if required path param is missing from path template', () => {
      assert.throws(() => validateCloudApiDefinition(validDef({
        path: '/api/v1/deployments',
        input: {
          type: 'object',
          properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } },
          required: ['id'],
        },
      })), /not in path template/)
    })
  })
})
