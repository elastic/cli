/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
import { docsApiReference } from './client.ts'

/** Injectable dependencies for the `docs api` commands. */
export interface ApiDeps {
  docsApiReference: typeof docsApiReference
}

const defaultDeps: ApiDeps = { docsApiReference }

// Schema keys are the docs API query parameters (`query` is sent as `q`); toKebabCase turns them into flags.
const api = { type: 'string', description: "API key, e.g. 'elasticsearch' or 'kibana'. `elastic docs api list` lists the keys." }
const version = { type: 'string', description: "API version: 'main' or a major such as '9'. Needs --api. Without it, the current version is used." }

interface Operation { title: string; url: string; method: string; path: string; operationId: string; deprecated?: boolean }
interface Field { path: string; type: string; location: string; description: string }

function absUrl (url: string): string {
  return url.startsWith('/') ? `https://www.elastic.co${url}` : url
}

function opLine (o: Operation): string {
  return `${o.method.padEnd(7)}${o.path}  (${o.operationId})${o.deprecated === true ? ' [deprecated]' : ''}\n  ${absUrl(o.url)}\n`
}

function fieldLine (f: Field): string {
  return `  ${f.location.padEnd(9)}${f.path} <${f.type}>${f.description !== '' ? ` ${f.description.split('\n')[0]!}` : ''}\n`
}

interface ApiCommandConfig {
  name: string
  description: string
  /** Path under `/_api/v1/api-reference`. */
  path: string
  properties: Record<string, unknown>
  positionalArg: { name: string; description: string }
  /** Maps the positional value onto query parameters. */
  fromArg: (arg: string) => Record<string, unknown>
  format: (reply: Record<string, unknown>) => string
}

function apiCommand (config: ApiCommandConfig, deps: ApiDeps): OpaqueCommandHandle {
  return defineCommand({
    name: config.name,
    description: config.description,
    input: { type: 'object', properties: config.properties, additionalProperties: false },
    positionalArg: { ...config.positionalArg, required: false },
    handler: async (parsed): Promise<JsonValue> => {
      const arg = parsed.arg?.trim()
      const merged: Record<string, unknown> = { ...(parsed.input ?? {}), ...(arg != null && arg !== '' ? config.fromArg(arg) : {}) }
      const { query, ...params } = merged
      try {
        return await deps.docsApiReference(config.path, query === undefined ? params : { q: query, ...params }) as JsonValue
      } catch (err) {
        return { error: { code: 'docs_error', message: err instanceof Error ? err.message : String(err) } }
      }
    },
    formatOutput: (result: JsonValue): string => {
      // --output-fields can strip the keys format() reads; fall back to plain JSON then.
      try { return config.format(result as Record<string, unknown>) } catch { return JSON.stringify(result, null, 2) + '\n' }
    },
  })
}

/** `elastic docs api search`: find REST API operations by words, route, or field path. */
export function createApiSearchCommand (deps: ApiDeps = defaultDeps): OpaqueCommandHandle {
  return apiCommand({
    name: 'search',
    description: 'Search the Elastic REST API reference for operations',
    path: '/search',
    properties: {
      query: { type: 'string', description: "Words, an endpoint such as 'GET /_cluster/health', or a field path; end a field with '.' to list its children" },
      api,
      version,
      include_deprecated: { type: 'boolean', description: 'Include deprecated operations' },
      page: { type: 'integer', minimum: 1, description: 'Page number', default: 1 },
      size: { type: 'integer', minimum: 1, maximum: 50, description: 'Results per page', default: 10 },
    },
    positionalArg: { name: 'query', description: 'Words, an endpoint, or a field path' },
    fromArg: (query) => ({ query }),
    format: (reply) => {
      const results = reply['results'] as Array<{ operation: Operation; matchedFields?: Field[] }>
      if (results.length === 0) return 'No operations found.\n'
      let out = ''
      for (const r of results) {
        out += opLine(r.operation)
        for (const f of r.matchedFields ?? []) out += fieldLine(f)
        out += '\n'
      }
      return out + `${results.length} of ${String(reply['totalHits'])} operations\n`
    },
  }, deps)
}

/** `elastic docs api get`: read one REST API operation with its fields. */
export function createApiGetCommand (deps: ApiDeps = defaultDeps): OpaqueCommandHandle {
  return apiCommand({
    name: 'get',
    description: 'Get one operation from the Elastic REST API reference, with its parameters and fields',
    path: '/operation',
    properties: {
      endpoint: { type: 'string', description: "A route as you would call it, e.g. 'GET /my-index/_search'" },
      operation_id: { type: 'string', description: "The OpenAPI operation id, e.g. 'cluster-health'" },
      api,
      version,
      include_body: { type: 'boolean', description: 'Include the page body' },
    },
    positionalArg: { name: 'operation', description: "An endpoint such as 'GET /_cluster/health', or an operation id" },
    // Operation ids never contain '/', endpoints always do.
    fromArg: (arg) => (arg.includes('/') ? { endpoint: arg } : { operation_id: arg }),
    format: (reply) => {
      const op = reply['operation'] as Operation & { description?: string }
      let out = `# ${op.title}\n` + opLine(op)
      if (op.description != null && op.description !== '') out += `\n${op.description}\n`
      const fields = reply['fields'] as Field[]
      if (fields.length > 0) out += '\nFields:\n' + fields.map(fieldLine).join('')
      if (typeof reply['body'] === 'string') out += `\n${reply['body']}\n`
      const others = reply['otherMatches'] as Operation[] | undefined
      if (others != null && others.length > 0) out += '\nOther matches:\n' + others.map(opLine).join('')
      return out
    },
  }, deps)
}

/** `elastic docs api list`: list the REST APIs, or the operations of one API by group. */
export function createApiListCommand (deps: ApiDeps = defaultDeps): OpaqueCommandHandle {
  return apiCommand({
    name: 'list',
    description: 'List the Elastic REST APIs, or the operations of one API by group',
    path: '/',
    properties: {
      api: { type: 'string', description: "API key, e.g. 'elasticsearch'. Omit to list every API." },
      version,
      group: { type: 'string', description: "Only the operations of this group, e.g. 'cluster'" },
    },
    positionalArg: { name: 'api', description: 'API key; omit to list every API' },
    fromArg: (key) => ({ api: key }),
    format: (reply) => {
      if (Array.isArray(reply['apis'])) {
        return (reply['apis'] as Array<{ key: string; title: string; versions: string[] }>)
          .map((a) => `${a.key.padEnd(24)}${a.title}  [${a.versions.join(', ')}]\n`).join('')
      }
      const groups = reply['groups'] as Array<{ name: string; count: number; operations?: Operation[] }>
      let out = ''
      for (const g of groups) {
        out += `${g.name} (${g.count})\n`
        if (g.operations != null) out += g.operations.map((o) => '  ' + opLine(o).replace('\n  ', '\n    ')).join('') + '\n'
      }
      if (typeof reply['note'] === 'string') out += `\n${reply['note']}\n`
      return out
    },
  }, deps)
}

/** The `elastic docs api` group: the docs API's API Explorer lookups, which the docs MCP server also exposes. */
export function createApiGroup (deps: ApiDeps = defaultDeps): OpaqueCommandHandle {
  return defineGroup(
    { name: 'api', description: 'Search, read, and list operations in the Elastic REST API reference' },
    createApiSearchCommand(deps),
    createApiGetCommand(deps),
    createApiListCommand(deps),
  )
}
