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

  it('sends a body field named "file" as JSON for a non-multipart endpoint', () => {
    // Constructed: no real non-multipart definition has a body field named `file`,
    // so this guards against reintroducing a value-based multipart heuristic.
    const def: KbApiDefinition = {
      name: 'create',
      namespace: 'spaces',
      description: 'Create a space',
      method: 'POST',
      path: '/api/spaces/space',
      input: {
        type: 'object',
        properties: {
          file: { type: 'string', 'x-found-in': 'body' },
        },
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ file: 'not-an-upload' }))
    assert.deepEqual(result.body, { file: 'not-an-upload' })
    assert.equal(result.multipartFields, undefined)
  })

  it('sends every body field as multipart for a real multipart definition', async () => {
    const { loadKbApisInFile } = await import('../../src/kb/apis.ts')
    const defs = await loadKbApisInFile('post_saved_objects_resolve_import_errors')
    const def = defs.find((d) => d.name === 'post-saved-objects-resolve-import-errors')
    assert.ok(def != null, 'expected post-saved-objects-resolve-import-errors to exist')
    const result = buildKibanaRequestParams(def, parsed({
      file: 'ndjson-contents',
      retries: '[{"type":"index-pattern"}]',
      createNewCopies: true,
    }))
    assert.deepEqual(result.multipartFields, { file: 'ndjson-contents', retries: '[{"type":"index-pattern"}]' })
    assert.equal(result.body, undefined)
    assert.deepEqual(result.querystring, { createNewCopies: 'true' })
  })

  it('every MULTIPART_ENDPOINTS entry matches a real definition', async () => {
    const { loadAllKbApis } = await import('../../src/kb/apis.ts')
    const { MULTIPART_ENDPOINTS } = await import('../../src/kb/request-builder.ts')
    const real = new Set((await loadAllKbApis()).map((d) => `${d.namespace} ${d.name}`))
    const stale = [...MULTIPART_ENDPOINTS].filter((key) => !real.has(key))
    assert.deepEqual(stale, [], 'stale multipart endpoint keys')
  })

  it('upstream schemas still emit no multipart/binary signal (delete MULTIPART_ENDPOINTS when they do)', async () => {
    const { loadAllKbApis } = await import('../../src/kb/apis.ts')
    const signals = ['contentMediaType', 'contentEncoding', 'x-content-type', 'x-body-format']
    const found: string[] = []
    for (const def of await loadAllKbApis()) {
      const props = (def.input?.['properties'] ?? {}) as Record<string, Record<string, unknown>>
      for (const [name, prop] of Object.entries(props)) {
        const hit = signals.find((key) => prop[key] != null)
        if (hit != null) found.push(`${def.namespace} ${def.name}.${name}: ${hit}`)
        if (prop['format'] === 'binary') found.push(`${def.namespace} ${def.name}.${name}: format=binary`)
      }
    }
    assert.deepEqual(found, [], 'upstream now signals request-body encoding; derive multipart from the schema')
  })

  it('promotes an "x-body-root" field to be the entire body, for a real definition', async () => {
    const { loadAllKbApis } = await import('../../src/kb/apis.ts')
    const defs = await loadAllKbApis()
    const def = defs.find((d) => d.namespace === 'agent-builder' && d.name === 'post-agent-builder-a2a-agentid')
    assert.ok(def != null, 'expected post-agent-builder-a2a-agentid to exist in the manifest')
    const result = buildKibanaRequestParams(def, parsed({ agentId: 'a1', body: { hello: 1 } }))
    assert.deepEqual(result.body, { hello: 1 }, 'body value should be the body itself, not nested under "body"')
  })

  it('does not promote when another body field also has a value', () => {
    const def: KbApiDefinition = {
      name: 'post-thing',
      namespace: 'widgets',
      description: 'Post a thing',
      method: 'POST',
      path: '/api/widgets',
      input: {
        type: 'object',
        properties: {
          body: { type: 'object', 'x-found-in': 'body', 'x-body-root': true },
          note: { type: 'string', 'x-found-in': 'body' },
        },
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ body: { a: 1 }, note: 'n' }))
    assert.deepEqual(result.body, { body: { a: 1 }, note: 'n' })
  })
})

describe('buildKibanaRequestParams path param requiredness (BUG A regression)', () => {
  // ponytail: no real Kibana definition currently has an optional path param
  // (0 of 555 upstream definitions exercise this — see test/kb/register.test.ts),
  // so this exercises the branch with a constructed definition.
  it('strips an optional path param placeholder instead of leaving it literal', () => {
    const def: KbApiDefinition = {
      name: 'get-widget',
      namespace: 'widgets',
      description: 'Get a widget, optionally scoped',
      method: 'GET',
      path: '/api/widgets/{scope}',
      input: {
        type: 'object',
        properties: {
          scope: { type: 'string', 'x-found-in': 'path' },
        },
        // no `required` array -> scope is optional
      },
    }
    const result = buildKibanaRequestParams(def, parsed())
    assert.equal(result.path, '/api/widgets')
  })

  it('still interpolates a required path param when provided', () => {
    const def: KbApiDefinition = {
      name: 'get-widget',
      namespace: 'widgets',
      description: 'Get a widget',
      method: 'GET',
      path: '/api/widgets/{id}',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', 'x-found-in': 'path' },
        },
        required: ['id'],
      },
    }
    const result = buildKibanaRequestParams(def, parsed({ id: 'abc' }))
    assert.equal(result.path, '/api/widgets/abc')
  })
})
