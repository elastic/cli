/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRequestParams } from '../../src/es/request-builder.ts'
import { buildKibanaRequestParams } from '../../src/kb/request-builder.ts'
import { buildCloudRequestParams } from '../../src/cloud/request-builder.ts'
import { EsClient } from '../../src/lib/es-client.ts'
import { KibanaClient } from '../../src/lib/kibana-client.ts'
import { CloudClient } from '../../src/lib/cloud-client.ts'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'

const BASE = 'http://localhost:1234'

interface Case {
  name: string
  path: string
  properties: Record<string, Record<string, unknown>>
  required?: string[]
  input: Record<string, unknown>
  /** expected path + querystring on the wire, per product */
  expected: Record<'es' | 'kb' | 'cloud', string>
}

function same (url: string): Case['expected'] {
  return { es: url, kb: url, cloud: url }
}

function schemaOf (c: Case): Record<string, unknown> {
  return { type: 'object', properties: c.properties, ...(c.required != null ? { required: c.required } : {}) }
}

const pathParam = { type: 'string', 'x-found-in': 'path' }

const CASES: Case[] = [
  {
    name: 'optional path param absent at the end',
    path: '/a/{x}',
    properties: { x: pathParam },
    input: {},
    expected: same('/a'),
  },
  {
    name: 'optional path param absent in the middle',
    path: '/a/{x}/b',
    properties: { x: pathParam },
    input: {},
    expected: same('/a/b'),
  },
  {
    name: 'only path segment absent',
    path: '/{x}',
    properties: { x: pathParam },
    input: {},
    expected: same('/'),
  },
  {
    name: 'token inside a segment',
    path: '/a/{x}.json',
    properties: { x: pathParam },
    required: ['x'],
    input: { x: 'v' },
    expected: same('/a/v.json'),
  },
  {
    // `a.b` comes first so an unescaped regex built from it would match `{aXb}`
    name: 'key with regex metacharacters',
    path: '/r/{aXb}/{a.b}',
    properties: { 'a.b': pathParam, aXb: pathParam },
    required: ['aXb'],
    input: { aXb: 'v' },
    expected: same('/r/v'),
  },
  {
    // Kibana deliberately sends the JSON array form; see src/lib/request-routing.ts
    name: 'array query param',
    path: '/q',
    properties: { q: { type: 'array', items: { type: 'string' }, 'x-found-in': 'query' } },
    input: { q: ['a', 'b'] },
    expected: {
      es: '/q?q=a%2Cb',
      kb: `/q?q=${encodeURIComponent('["a","b"]')}`,
      cloud: '/q?q=a%2Cb',
    },
  },
  {
    name: 'adversarial path value',
    path: '/a/{x}',
    properties: { x: pathParam },
    required: ['x'],
    input: { x: '../?#/' },
    expected: same('/a/..%2F%3F%23%2F'),
  },
]

interface WireClient<P> {
  _testSetFetch: (fn: typeof fetch) => void
  request: (params: P) => Promise<unknown>
}

/** Sends `params` through the real client and returns the path + querystring it fetched. */
async function wireUrl<P> (client: WireClient<P>, params: P): Promise<string> {
  let url = ''
  client._testSetFetch((async (u: string) => {
    url = u
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch)
  await client.request(params)
  return url.slice(BASE.length)
}

const SENDERS: Record<keyof Case['expected'], (c: Case) => Promise<string>> = {
  es: async (c) => {
    const def = { name: 'fixture', description: '', method: 'GET' as const, path: c.path, input: schemaOf(c) }
    return await wireUrl(new EsClient(BASE), buildRequestParams(def, { options: {}, input: c.input }, extractSchemaArgs(def.input)))
  },
  kb: async (c) => {
    const def = { name: 'fixture', namespace: 'fixture', description: '', method: 'GET' as const, path: c.path, input: schemaOf(c) }
    return await wireUrl(new KibanaClient(BASE), buildKibanaRequestParams(def, { options: {}, input: c.input }, extractSchemaArgs(def.input)))
  },
  cloud: async (c) => {
    const def = { name: 'fixture', namespace: 'fixture', description: '', method: 'GET' as const, path: c.path, input: schemaOf(c), destructive: false, readOnly: true }
    return await wireUrl(new CloudClient(BASE, 'key'), buildCloudRequestParams(def, { options: {}, input: c.input }, extractSchemaArgs(def.input)))
  },
}

describe('request routing across the ES, Kibana, and Cloud builders', () => {
  for (const c of CASES) {
    for (const product of ['es', 'kb', 'cloud'] as const) {
      it(`${c.name}: ${product}`, async () => assert.equal(await SENDERS[product](c), c.expected[product]))
    }
  }
})
