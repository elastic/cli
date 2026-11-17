/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { docsApi } from '../../src/docs/client.ts'
import { createApiGroup, createApiGetCommand, createApiListCommand, createApiSearchCommand } from '../../src/docs/api.ts'
import type { ApiDeps } from '../../src/docs/api.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
import type { OpaqueCommandHandle } from '../../src/factory.ts'
import { captureDuring } from '../helpers/capture.ts'

const realFetch = globalThis.fetch

describe('docsApi', () => {
  afterEach(() => { globalThis.fetch = realFetch })

  function install (body: string, status = 200): Array<{ url: string; init: RequestInit }> {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(body, { status })
    }) as typeof fetch
    return calls
  }

  it('GETs the path with encoded params, dropping null and undefined', async () => {
    const calls = install(JSON.stringify({ totalHits: 1, results: [] }))
    const reply = await docsApi('/api-operations', { q: 'GET /{index}/_search?x=1#y', api: 'elasticsearch', version: undefined, include_deprecated: true, size: null })
    assert.deepEqual(reply, { totalHits: 1, results: [] })
    assert.equal(calls[0]!.url, 'https://www.elastic.co/docs/_api/v1/api-operations?q=GET+%2F%7Bindex%7D%2F_search%3Fx%3D1%23y&api=elasticsearch&include_deprecated=true')
    assert.equal(calls[0]!.init.method, undefined)
    assert.equal(calls[0]!.init.redirect, 'error')
    assert.deepEqual(calls[0]!.init.headers, { Accept: 'application/json', Cookie: 'feature_search_or_askai_enabled=true' })
  })

  it('throws the server message of a rejection', async () => {
    install(JSON.stringify({ errorType: 'operation_not_found', message: 'No API operation matches nope.' }), 404)
    await assert.rejects(docsApi('/api-operations/elasticsearch%3Anope', {}), /^Error: docs api error \(404\): No API operation matches nope\.$/)
  })

  it('drops an HTML error page and keeps the status', async () => {
    install('<html>forbidden</html>', 403)
    await assert.rejects(docsApi('/apis', {}), /^Error: docs api error \(403\): (Forbidden|request failed)$/)
  })
})

async function run (cmd: OpaqueCommandHandle, argv: string[], stdin = ''): Promise<{ stdout: string; exitCode: number }> {
  const restoreStdin = _testSetStdinReader(() => stdin)
  cmd.exitOverride()
  cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  let thrown = false
  const captured = await captureDuring(async () => {
    try {
      await cmd.parseAsync(argv, { from: 'user' })
    } catch {
      // exitOverride turns validation failures into a thrown CommanderError
      thrown = true
    }
  }).finally(restoreStdin)
  const exitCode = thrown ? 1 : Number(process.exitCode ?? 0)
  process.exitCode = 0
  return { stdout: captured.stdout.join(''), exitCode }
}

/** Answers each call with the next reply; the last one repeats. */
function fake (...replies: unknown[]): { deps: ApiDeps; calls: Array<{ path: string; params: Record<string, unknown> }> } {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = []
  return { calls, deps: { docsApi: async (path, params) => { calls.push({ path, params }); return replies[Math.min(calls.length, replies.length) - 1] } } }
}

const op = { id: 'elasticsearch:cluster-health', api: 'elasticsearch', title: 'Get cluster health', url: '/docs/api/doc/elasticsearch/operation/operation-cluster-health', method: 'GET', path: '/_cluster/health', operationId: 'cluster-health', endpoints: [] }

describe('docs api commands', () => {
  it('groups search, get and list under api', () => {
    assert.deepEqual(createApiGroup().commands.map((c) => c.name()), ['search', 'get', 'list'])
  })

  it('search sends the positional query as q with its flags to the collection', async () => {
    const { deps, calls } = fake({ query: 'health', totalHits: 1, results: [{ operation: op, score: 1, matchedFields: [] }] })
    const { stdout, exitCode } = await run(createApiSearchCommand(deps), ['GET /_cluster/health', '--api', 'elasticsearch', '--include-deprecated', '--size', '5'])
    assert.equal(exitCode, 0)
    assert.deepEqual(calls, [{ path: '/api-operations', params: { q: 'GET /_cluster/health', api: 'elasticsearch', include_deprecated: true, size: 5, page: 1 } }])
    assert.match(stdout, /GET {4}\/_cluster\/health {2}\(cluster-health\)/)
    assert.match(stdout, /https:\/\/www\.elastic\.co\/docs\/api\/doc\/elasticsearch\/operation\/operation-cluster-health/)
  })

  it('search rejects an out-of-range page size before calling the server', async () => {
    const { deps, calls } = fake({})
    const { exitCode } = await run(createApiSearchCommand(deps), ['x', '--size', '0'])
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 0)
  })

  it('search rejects an unknown key in JSON input', async () => {
    const { deps, calls } = fake({})
    const { exitCode } = await run(createApiSearchCommand(deps), [], '{"query":"x","bogus":1}')
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 0)
  })

  it('get with an endpoint reads every match with its fields in one request', async () => {
    const other = { ...op, id: 'kibana:kibana-health', api: 'kibana', operationId: 'kibana-health', path: '/api/health' }
    const level = { name: 'level', path: 'level', type: 'string', location: 'query', description: 'Detail level' }
    const { deps, calls } = fake({ totalHits: 2, results: [{ operation: op, versions: ['9'], fields: [level], body: 'Body' }, { operation: other, versions: [], fields: [] }] })
    const { stdout, exitCode } = await run(createApiGetCommand(deps), ['GET /_cluster/health', '--include-body'])
    assert.equal(exitCode, 0)
    assert.deepEqual(calls, [{ path: '/api-operations', params: { endpoint: 'GET /_cluster/health', operation_id: undefined, api: undefined, version: undefined, view: 'full', include_body: true } }])
    assert.match(stdout, /# Get cluster health/)
    assert.match(stdout, /query {4}level <string> Detail level/)
    assert.match(stdout, /\nBody\n/)
    assert.match(stdout, /Other matches:\nGET {4}\/api\/health {2}\(kibana-health\)/)
  })

  it('get --json returns one operation shape for a lookup through the collection', async () => {
    const { deps } = fake({ totalHits: 1, results: [{ operation: op, versions: ['9'], fields: [] }] })
    const cmd = createApiGetCommand(deps)
    cmd.option('--json')
    const { stdout } = await run(cmd, ['cluster-health', '--json'])
    assert.deepEqual(JSON.parse(stdout), { operation: op, versions: ['9'], fields: [], body: null, otherMatches: [] })
  })

  it('get with an endpoint that nothing serves fails', async () => {
    const { deps, calls } = fake({ totalHits: 0, results: [] })
    const { stdout, exitCode } = await run(createApiGetCommand(deps), ['GET /nope', '--api', 'elasticsearch'])
    assert.equal(exitCode, 1)
    assert.equal(stdout, '')
    assert.equal(calls.length, 1)
  })

  it('get with an operation id and an api reads the operation by its id', async () => {
    const { deps, calls } = fake({ operation: op, versions: [], fields: [], otherMatches: [] })
    const { exitCode } = await run(createApiGetCommand(deps), ['cluster-health', '--api', 'elasticsearch', '--version', '9'])
    assert.equal(exitCode, 0)
    assert.deepEqual(calls, [{ path: '/api-operations/elasticsearch%3Acluster-health', params: { version: '9', include_body: undefined } }])
  })

  it('get without an api looks the operation id up across APIs', async () => {
    const { deps, calls } = fake({ totalHits: 1, results: [{ operation: op, versions: [], fields: [] }] })
    await run(createApiGetCommand(deps), ['cluster-health'])
    assert.deepEqual(calls[0], { path: '/api-operations', params: { endpoint: undefined, operation_id: 'cluster-health', api: undefined, version: undefined, view: 'full', include_body: undefined } })
  })

  it('get encodes the id into one path segment', async () => {
    const { deps, calls } = fake({ operation: op, versions: [], fields: [], otherMatches: [] })
    await run(createApiGetCommand(deps), ['--operation-id', '../x?y=1#z', '--api', 'a/b'])
    assert.equal(calls[0]!.path, '/api-operations/a%2Fb%3A..%2Fx%3Fy%3D1%23z')
  })

  it('get rejects both an operation id and an endpoint without calling the server', async () => {
    const { deps, calls } = fake({})
    const { exitCode } = await run(createApiGetCommand(deps), ['--operation-id', 'a', '--endpoint', 'GET /b'])
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 0)
  })

  it('get reports a server error with exit code 1', async () => {
    const cmd = createApiGetCommand({ docsApi: async () => { throw new Error('No API operation matches nope.') } })
    const { stdout, exitCode } = await run(cmd, ['nope'])
    assert.equal(exitCode, 1)
    assert.equal(stdout, '')
  })

  it('search without a query fails without calling the server', async () => {
    const { deps, calls } = fake({})
    const { exitCode } = await run(createApiSearchCommand(deps), [])
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 0)
  })

  it('search reports no results', async () => {
    const { deps } = fake({ query: 'x', totalHits: 0, results: [] })
    assert.equal((await run(createApiSearchCommand(deps), ['x'])).stdout, 'No operations found.\n')
  })

  it('get prints the description, body, deprecation and other matches', async () => {
    const { deps } = fake({
      operation: { ...op, description: 'Checks health.', deprecated: true },
      versions: [],
      fields: [{ name: 'index', path: 'index', type: 'string', location: 'path', description: '' }],
      body: 'Full body.',
      otherMatches: [{ ...op, api: 'kibana', path: '/api/health' }],
    })
    const { stdout } = await run(createApiGetCommand(deps), ['cluster-health', '--api', 'elasticsearch'])
    assert.match(stdout, /\[deprecated\]/)
    assert.match(stdout, /Checks health\./)
    assert.match(stdout, /path {5}index <string>\n/)
    assert.match(stdout, /Full body\./)
    assert.match(stdout, /Other matches:\nGET {4}\/api\/health/)
  })

  it('falls back to JSON when --output-fields strips what the formatter reads', async () => {
    const { deps } = fake({ query: 'x', totalHits: 3, results: [] })
    const cmd = createApiSearchCommand(deps)
    cmd.option('--output-fields <fields>')
    const { stdout } = await run(cmd, ['x', '--output-fields', 'totalHits'])
    assert.deepEqual(JSON.parse(stdout), { totalHits: 3 })
  })

  it('list without a key lists the APIs', async () => {
    const { deps, calls } = fake({ apis: [{ key: 'elasticsearch', title: 'Elasticsearch API', url: '/x', versions: ['main', '9'] }] })
    const { stdout } = await run(createApiListCommand(deps), [])
    assert.deepEqual(calls[0], { path: '/apis', params: {} })
    assert.match(stdout, /elasticsearch\s+Elasticsearch API {2}\[main, 9\]/)
  })

  it('list with a key counts the API\'s groups', async () => {
    const { deps, calls } = fake({ api: 'kibana', totalOperations: 41, groups: [{ name: 'cluster', count: 1 }, { name: 'ml', count: 40 }] })
    const { stdout } = await run(createApiListCommand(deps), ['kibana'])
    assert.deepEqual(calls[0], { path: '/apis/kibana/groups', params: { version: undefined } })
    assert.equal(stdout, 'cluster (1)\nml (40)\n')
  })

  it('list with a group lists its operations a page at a time', async () => {
    const { deps, calls } = fake({ totalHits: 12, results: [{ operation: op }] })
    const { stdout } = await run(createApiListCommand(deps), ['elasticsearch', '--group', 'cluster', '--page', '2'])
    assert.deepEqual(calls[0], { path: '/api-operations', params: { api: 'elasticsearch', version: undefined, group: 'cluster', page: 2, size: undefined } })
    assert.match(stdout, /^GET {4}\/_cluster\/health {2}\(cluster-health\)\n.*\n1 of 12 operations\n$/)
  })

  it('list encodes the api key into one path segment', async () => {
    const { deps, calls } = fake({ api: 'x', totalOperations: 0, groups: [] })
    await run(createApiListCommand(deps), ['../x'])
    assert.equal(calls[0]!.path, '/apis/..%2Fx/groups')
  })

  it('list rejects --version without an api key', async () => {
    const { deps, calls } = fake({})
    const { exitCode } = await run(createApiListCommand(deps), ['--version', '9'])
    assert.equal(exitCode, 1)
    assert.equal(calls.length, 0)
  })

  it('--json passes the server reply through unchanged', async () => {
    const reply = { apis: [] }
    const { deps } = fake(reply)
    const cmd = createApiListCommand(deps)
    cmd.option('--json')
    const { stdout } = await run(cmd, ['--json'])
    assert.deepEqual(JSON.parse(stdout), reply)
  })
})
