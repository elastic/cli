/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildKibanaRequestParams } from '../../src/kb/request-builder.ts'
import type { KbApiDefinition } from '../../src/kb/types.ts'
import type { ParsedResult } from '../../src/factory.ts'

function parsed (input?: Record<string, unknown>): ParsedResult {
  return { options: {}, ...(input !== undefined ? { input } : {}) }
}

describe('buildKibanaRequestParams', () => {
  it('returns method and path for a simple GET', () => {
    const def: KbApiDefinition = {
      name: 'get',
      namespace: 'spaces',
      description: 'List spaces',
      method: 'GET',
      path: '/api/spaces/space',
    }
    const result = buildKibanaRequestParams(def, parsed())
    assert.equal(result.method, 'GET')
    assert.equal(result.path, '/api/spaces/space')
    assert.equal(result.body, undefined)
    assert.equal(result.multipartFields, undefined)
  })

  it('sends a body field as JSON when it is not named "file"', () => {
    const def: KbApiDefinition = {
      name: 'create',
      namespace: 'spaces',
      description: 'Create a space',
      method: 'POST',
      path: '/api/spaces/space',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', 'x-found-in': 'body' },
        },
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ name: 'engineering' }))
    assert.deepEqual(result.body, { name: 'engineering' })
    assert.equal(result.multipartFields, undefined)
  })

  it('routes a body field named "file" through multipart instead of JSON', () => {
    const def: KbApiDefinition = {
      name: 'import',
      namespace: 'saved-objects',
      description: 'Import saved objects',
      method: 'POST',
      path: '/api/saved_objects/_import',
      input: {
        type: 'object',
        properties: {
          file: { type: 'string', 'x-found-in': 'body' },
        },
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ file: 'ndjson-contents' }))
    assert.deepEqual(result.multipartFields, { file: 'ndjson-contents' })
    assert.equal(result.body, undefined)
  })

  it('sends every body field as multipart when a "file" field is present, not just the file', () => {
    const def: KbApiDefinition = {
      name: 'resolve-import-errors',
      namespace: 'saved-objects',
      description: 'Resolve import errors',
      method: 'POST',
      path: '/api/saved_objects/_resolve_import_errors',
      input: {
        type: 'object',
        properties: {
          file: { type: 'string', 'x-found-in': 'body' },
          retries: { type: 'string', 'x-found-in': 'body' },
        },
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ file: 'ndjson-contents', retries: '[{"type":"index-pattern"}]' }))
    assert.deepEqual(result.multipartFields, { file: 'ndjson-contents', retries: '[{"type":"index-pattern"}]' })
    assert.equal(result.body, undefined)
  })
})
