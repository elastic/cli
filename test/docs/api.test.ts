/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { docsApiReference } from '../../src/docs/client.ts'
import { createApiGroup, createApiGetCommand, createApiListCommand, createApiSearchCommand } from '../../src/docs/api.ts'
import type { ApiDeps } from '../../src/docs/api.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
import type { OpaqueCommandHandle } from '../../src/factory.ts'

const realFetch = globalThis.fetch

describe('docsApiReference', () => {
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
    const reply = await docsApiReference('/search', { q: 'GET /{index}/_search?x=1#y', api: 'elasticsearch', version: undefined, include_deprecated: true, size: null })
    assert.deepEqual(reply, { totalHits: 1, results: [] })
    assert.equal(calls[0]!.url, 'https://www.elastic.co/docs/_api/v1/api-reference/search?q=GET+%2F%7Bindex%7D%2F_search%3Fx%3D1%23y&api=elasticsearch&include_deprecated=true')
    assert.equal(calls[0]!.init.method, undefined)
    assert.equal(calls[0]!.init.redirect, 'error')
    assert.deepEqual(calls[0]!.init.headers, { Accept: 'application/json', Cookie: 'feature_search_or_askai_enabled=true' })
  })

  it('throws the server message of a rejection', async () => {
    install(JSON.stringify({ errorType: 'operation_not_found', message: 'No API operation matches nope.' }), 404)
    await assert.rejects(docsApiReference('/operation', { operation_id: 'nope' }), /^Error: docs api error \(404\): No API operation matches nope\.$/)
  })

  it('drops an HTML error page and keeps the status', async () => {
    install('<html>forbidden</html>', 403)
    await assert.rejects(docsApiReference('/', {}), /^Error: docs api error \(403\): (Forbidden|request failed)$/)
  })
})

async function run (cmd: OpaqueCommandHandle, argv: string[], stdin = ''): Promise<{ stdout: string; exitCode: number }> {
  let stdout = ''
  const realWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((s: string) => { stdout += s; return true }) as typeof process.stdout.write
  const restoreStdin = _testSetStdinReader(() => stdin)
  cmd.exitOverride()
  cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  let thrown = false
  try {
    await cmd.parseAsync(argv, { from: 'user' })
  } catch {
    // exitOverride turns validation failures into a thrown CommanderError
    thrown = true
  } finally {
    process.stdout.write = realWrite
    restoreStdin()
  }
  const exitCode = thrown ? 1 : Number(process.exitCode ?? 0)
  process.exitCode = 0
  return { stdout, exitCode }
}

function fake (reply: unknown): { deps: ApiDeps; calls: Array<{ path: string; params: Record<string, unknown> }> } {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = []
  return { calls, deps: { docsApiReference: async (path, params) => { calls.push({ path, params }); return reply } } }
}

const op = { api: 'elasticsearch', title: 'Get cluster health', url: '/docs/api/doc/elasticsearch/operation/operation-cluster-health', method: 'GET', path: '/_cluster/health', operationId: 'cluster-health', endpoints: [] }

describe('docs api commands', () => {
  it('groups search, get and list under api', () => {
    assert.deepEqual(createApiGroup().commands.map((c) => c.name()), ['search', 'get', 'list'])
  })

  it('search sends the positional query as q with its flags to /search', async () => {
    const { deps, calls } = fake({ query: 'health', totalHits: 1, results: [{ operation: op, score: 1, matchedFields: [] }] })
    const { stdout, exitCode } = await run(createApiSearchCommand(deps), ['GET /_cluster/health', '--api', 'elasticsearch', '--include-deprecated', '--size', '5'])
    assert.equal(exitCode, 0)
    assert.deepEqual(calls, [{ path: '/search', params: { q: 'GET /_cluster/health', api: 'elasticsearch', include_deprecated: true, size: 5, page: 1 } }])
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

  it('get treats an argument with a slash as an endpoint', async () => {
    const { deps, calls } = fake({ operation: op, versions: ['9'], fields: [{ name: 'level', path: 'level', type: 'string', location: 'query', description: 'Detail level' }], otherMatches: [] })
    const { stdout, exitCode } = await run(createApiGetCommand(deps), ['GET /_cluster/health', '--api', 'elasticsearch'])
    assert.equal(exitCode, 0)
    assert.deepEqual(calls[0], { path: '/operation', params: { api: 'elasticsearch', endpoint: 'GET /_cluster/health' } })
    assert.match(stdout, /# Get cluster health/)
    assert.match(stdout, /query {4}level <string> Detail level/)
  })

  it('get treats an argument without a slash as an operation id', async () => {
    const { deps, calls } = fake({ operation: op, versions: [], fields: [], otherMatches: [] })
    await run(createApiGetCommand(deps), ['cluster-health'])
    assert.deepEqual(calls[0]!.params, { operation_id: 'cluster-health' })
  })

  it('get reports a tool error with exit code 1', async () => {
    const cmd = createApiGetCommand({ docsApiReference: async () => { throw new Error('No API operation matches nope.') } })
    const { stdout, exitCode } = await run(cmd, ['nope'])
    assert.equal(exitCode, 1)
    assert.equal(stdout, '')
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
    const { stdout } = await run(createApiGetCommand(deps), ['cluster-health'])
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
    assert.deepEqual(calls[0], { path: '/', params: {} })
    assert.match(stdout, /elasticsearch\s+Elasticsearch API {2}\[main, 9\]/)
  })

  it('list with a key prints groups, operations and the server note', async () => {
    const { deps, calls } = fake({ api: 'kibana', totalOperations: 1, groups: [{ name: 'cluster', count: 1, operations: [op] }, { name: 'ml', count: 40 }], note: 'Pass group.' })
    const { stdout } = await run(createApiListCommand(deps), ['kibana', '--group', 'cluster'])
    assert.deepEqual(calls[0]!.params, { group: 'cluster', api: 'kibana' })
    assert.match(stdout, /^cluster \(1\)\n {2}GET/)
    assert.match(stdout, /ml \(40\)/)
    assert.match(stdout, /Pass group\./)
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
