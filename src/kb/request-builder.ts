/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import { isPlainObject } from '../lib/type-guards.ts'
import type { ParsedResult } from '../factory.ts'
import type { KibanaRequestParams } from '../lib/kibana-client.ts'

/**
 * Kibana endpoints whose request body must be sent as `multipart/form-data`.
 *
 * Keyed by `"<namespace> <name>"`. `@elastic/schemas` flattens these uploads into ordinary
 * string body properties with no content-type, `contentEncoding`, `format: binary`, or other
 * usable signal, so the set cannot be derived at runtime and is maintained here explicitly.
 *
 * ponytail: static list pending an upstream `@elastic/schemas` annotation for multipart/binary
 * request bodies; delete this set and derive it from the schema once that lands.
 * `test/kb/request-builder.test.ts` fails if an entry stops matching a real definition, and
 * fails if upstream starts emitting a multipart signal (meaning this list can go away).
 */
export const MULTIPART_ENDPOINTS = new Set([
  'saved-objects post-saved-objects-import',
  'saved-objects post-saved-objects-resolve-import-errors',
  'security-detections-api import-rules',
  'security-endpoint-management-api endpoint-script-library-create-script',
  'security-endpoint-management-api endpoint-script-library-patch-update-script',
  'security-entity-analytics-api privmon-bulk-upload-users-c-s-v',
  'security-entity-analytics-api upload-watchlist-csv',
  'security-exceptions-api import-exception-list',
  'security-lists-api import-list-items',
])

/**
 * Builds a `KibanaRequestParams` from an API definition and parsed CLI input.
 *
 * Routing is derived from `x-found-in` in the JSON Schema properties:
 * - `"path"` -> interpolated into URL path
 * - `"query"` -> sent as querystring
 * - `"body"` (or absent) -> collected into request body
 *
 * @param def - the API definition describing the Kibana endpoint
 * @param parsed - the CLI-parsed result; all API params live in `parsed.input`
 * @returns `KibanaRequestParams` ready to pass to `KibanaClient.request()`
 */
export function buildKibanaRequestParams (
  def: KbApiDefinition,
  parsed: ParsedResult
): KibanaRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>
  const props = ((def.input?.['properties'] ?? {}) as Record<string, Record<string, unknown>>)

  const required = new Set(Array.isArray(def.input?.['required']) ? def.input!['required'] as string[] : [])
  const path = interpolatePath(def.path, props, required, input)
  const querystring = buildQuerystring(props, input)

  const params: KibanaRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring

  const body = collectBody(props, input)
  // Multipart encoding is decided from the definition's identity via MULTIPART_ENDPOINTS,
  // never from the runtime value of a field: @elastic/schemas emits no content-type or
  // binary-format annotation for these uploads. All body fields are sent as form fields
  // because these endpoints require siblings alongside the file (e.g. saved-objects
  // resolve-import-errors needs `retries`).
  const fields = isPlainObject(body) ? body : undefined
  if (fields != null && MULTIPART_ENDPOINTS.has(`${def.namespace} ${def.name}`)) {
    params.multipartFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    )
  } else if (body !== undefined) {
    params.body = body
  }

  return params
}

/** Percent-encodes a single Kibana path parameter value. */
function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}

/**
 * Interpolates `{param}` tokens in the path template, stripping optional
 * segments whose value was not supplied.
 */
function interpolatePath (
  path: string,
  props: Record<string, Record<string, unknown>>,
  required: Set<string>,
  input: Record<string, unknown>
): string {
  for (const [key, prop] of Object.entries(props)) {
    if (prop['x-found-in'] !== 'path') continue
    const value = input[key]
    if (value !== undefined) {
      path = path.replace(`{${key}}`, encodePathParam(String(value)))
    } else if (!required.has(key)) {
      path = path.replace(new RegExp(`/?\\{${key}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

/**
 * Builds the querystring record from properties marked `x-found-in: "query"`.
 */
function buildQuerystring (
  props: Record<string, Record<string, unknown>>,
  input: Record<string, unknown>
): Record<string, string> {
  const qs: Record<string, string> = {}
  for (const [key, prop] of Object.entries(props)) {
    if (prop['x-found-in'] !== 'query') continue
    const value = input[key]
    if (value !== undefined) qs[key] = String(value)
  }
  return qs
}

/**
 * Collects request body fields. A single field marked `x-body-root` by
 * `@elastic/schemas` has its value promoted to be the whole body rather than nested
 * under the key -- 107 Kibana endpoints model their request body that way.
 *
 * Returns `undefined` when no body fields are present.
 */
function collectBody (
  props: Record<string, Record<string, unknown>>,
  input: Record<string, unknown>
): unknown {
  const body: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(props)) {
    const foundIn = prop['x-found-in'] as string | undefined
    if (foundIn === 'path' || foundIn === 'query') continue
    const value = input[key]
    if (value !== undefined) body[key] = value
  }
  // Also include any input keys that have no corresponding property definition
  for (const [key, value] of Object.entries(input)) {
    if (!(key in props) && value !== undefined) body[key] = value
  }
  const keys = Object.keys(body)
  if (keys.length === 0) return undefined
  if (keys.length === 1 && props[keys[0]!]?.['x-body-root'] === true) return body[keys[0]!]
  return body
}
