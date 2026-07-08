/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsRequestParams } from '../lib/es-client.ts'
import type { EsApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/json-schema-args.ts'
import type { RawJsonValue, ParsedResult } from '../factory.ts'

/**
 * Builds a `TransportRequestParams` object from an API definition, parsed CLI input,
 * and the schema arg definitions extracted from `def.input`.
 *
 * Each `SchemaArgDefinition` carries a `foundIn` field that determines routing:
 * - `"path"` → value is interpolated into the URL path template
 * - `"query"` → value is added to the querystring
 * - `"body"` or `undefined` → value is collected into the request body object
 */
export function buildRequestParams (
  def: EsApiDefinition,
  parsed: ParsedResult,
  schemaArgs: SchemaArgDefinition[]
): EsRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>
  const rawBody = parsed.rawBodyValues ?? {}

  const path = interpolatePath(def.path, schemaArgs, input)
  const querystring = buildQuerystring(schemaArgs, input)
  const body = collectBody(schemaArgs, input, rawBody, def.path, def.bodyFormat)

  // The index API uses PUT with {id} but POST without (auto-ID generation).
  let method = def.method
  if (method === 'PUT' && def.path.includes('/{id}')) {
    const idArg = schemaArgs.find(
      (a) => a.schemaKey === 'id' && a.foundIn === 'path' && !a.required
    )
    if (idArg != null && input[idArg.schemaKey] === undefined) method = 'POST'
  }

  const params: EsRequestParams = { method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring

  if (body !== undefined) {
    if (typeof body === 'string') {
      params.body = body
    } else if (def.bodyFormat === 'ndjson') {
      params.bulkBody = toNdjson(body)
    } else {
      params.body = body
    }
  }
  return params
}

/**
 * Encodes a single path parameter value. Splits on commas to preserve ES
 * multi-target syntax (e.g. "idx1,idx2") while encoding special characters.
 */
function encodePathParam (value: string): string {
  return value.split(',').map((s) => encodeURIComponent(s.trim())).join(',')
}

function interpolatePath (
  path: string,
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): string {
  for (const arg of schemaArgs.filter((a) => a.foundIn === 'path')) {
    const value = input[arg.schemaKey]
    if (value !== undefined) {
      path = path.replace(`{${arg.schemaKey}}`, encodePathParam(String(value)))
    } else if (!arg.required) {
      path = path.replace(new RegExp(`/\\{${arg.schemaKey}\\}`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

function buildQuerystring (
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): Record<string, unknown> {
  const qs: Record<string, unknown> = {}
  for (const arg of schemaArgs.filter((a) => a.foundIn === 'query')) {
    const value = input[arg.schemaKey]
    if (value !== undefined) qs[arg.schemaKey] = value
  }
  return qs
}

function toNdjson (body: Record<string, unknown>): string {
  for (const value of Object.values(body)) {
    if (Array.isArray(value)) {
      return value.map((item) => JSON.stringify(item)).join('\n') + '\n'
    }
  }
  return JSON.stringify(body) + '\n'
}

// Fields whose value should replace the entire request body (not nested under the key).
const BODY_ROOT_FIELDS: Record<string, Set<string> | '*'> = {
  document: '*',
  inference_config: '*',
  mappings: new Set(['/_data_stream/{name}/_mappings']),
  settings: new Set(['/_data_stream/{name}/_settings']),
  pipeline: new Set(['/_logstash/pipeline/{id}'])
}

export const BODY_ROOT_STAR_FIELDS = new Set(
  Object.entries(BODY_ROOT_FIELDS).filter(([, v]) => v === '*').map(([k]) => k)
)

/**
 * Collects request body fields from entries with `foundIn === "body"` or no `foundIn`.
 * Returns `undefined` when no body fields are present in the input.
 *
 * When a body value is a `RawJsonValue` (from CLI JSON parsing), the original
 * JSON string is preserved in the output so number formatting (e.g. `100.0`
 * for Painless floats) survives the round-trip.
 *
 * Special case: when the only body field with a value is in `BODY_ROOT_FIELDS`
 * (e.g. `document`), its value is promoted to be the entire body (#95).
 */
function collectBody (
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>,
  rawBody: Record<string, RawJsonValue>,
  apiPath: string,
  bodyFormat?: string
): Record<string, unknown> | string | undefined {
  const bodyArgs = schemaArgs.filter((a) => a.foundIn === 'body' || a.foundIn === undefined)
  const body: Record<string, unknown> = {}

  for (const arg of bodyArgs) {
    const value = input[arg.schemaKey]
    if (value !== undefined) body[arg.schemaKey] = value
  }

  if (Object.keys(body).length === 0) return undefined

  const keys = Object.keys(body)
  if (keys.length === 1) {
    const key = keys[0]!
    const rule = BODY_ROOT_FIELDS[key]
    if (rule === '*' || (rule instanceof Set && rule.has(apiPath))) {
      if (key in rawBody) return rawBody[key]!.raw
      return body[key] as Record<string, unknown>
    }
  }

  const hasRaw = bodyFormat !== 'ndjson' &&
    bodyArgs.some((a) => a.schemaKey in rawBody)
  if (hasRaw) {
    const parts = keys.map((k) => {
      if (k in rawBody) return `${JSON.stringify(k)}:${rawBody[k]!.raw}`
      return `${JSON.stringify(k)}:${JSON.stringify(body[k])}`
    })
    return `{${parts.join(',')}}`
  }

  return body
}
