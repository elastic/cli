/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import { isPlainObject } from '../lib/type-guards.ts'
import type { ParsedResult } from '../factory.ts'
import type { KibanaRequestParams } from '../lib/kibana-client.ts'
import { encodePathParam } from '../lib/path-encoding.ts'
import type { SchemaArgDefinition } from '../lib/json-schema-args.ts'
import { interpolatePath, routeBody, routeQuery } from '../lib/request-routing.ts'

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
  'streams post-streams-name-content-import',
])

/**
 * OAS still documents these at `/internal`; Kibana 9.5+ registers `/api`.
 * Keyed by `"<namespace> <name>"`. Delete an entry when `@elastic/schemas`
 * publishes the public path.
 */
export const PATH_OVERRIDES = new Map([
  ['slo get-definitions-op', '/s/{spaceId}/api/observability/slos/_definitions'],
])

/**
 * Builds a `KibanaRequestParams` from an API definition and parsed CLI input.
 *
 * Routing is derived from each arg's `foundIn` (`x-found-in`):
 * - `"path"` -> interpolated into URL path
 * - `"query"` -> sent as querystring; arrays as JSON (see `routeQuery`)
 * - `"body"` (or absent) -> collected into request body
 *
 * @param def - the API definition describing the Kibana endpoint
 * @param parsed - the CLI-parsed result; all API params live in `parsed.input`
 * @param schemaArgs - arg definitions extracted from `def.input` at registration time
 * @returns `KibanaRequestParams` ready to pass to `KibanaClient.request()`
 */
export function buildKibanaRequestParams (
  def: KbApiDefinition,
  parsed: ParsedResult,
  schemaArgs: SchemaArgDefinition[]
): KibanaRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  const path = interpolatePath(PATH_OVERRIDES.get(`${def.namespace} ${def.name}`) ?? def.path, input, encodePathParam)
  const querystring = Object.fromEntries(
    Object.entries(routeQuery(schemaArgs, input)).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])
  )

  const params: KibanaRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring

  const body = collectBody(schemaArgs, input)
  // Multipart encoding is decided from the definition's identity via MULTIPART_ENDPOINTS,
  // never from the runtime value of a field: @elastic/schemas emits no content-type or
  // binary-format annotation for these uploads. All body fields are sent as form fields
  // because these endpoints require siblings alongside the file (e.g. saved-objects
  // resolve-import-errors needs `retries`).
  const fields = isPlainObject(body) ? body : undefined
  const isMultipart = MULTIPART_ENDPOINTS.has(`${def.namespace} ${def.name}`)
  if (fields != null && isMultipart) {
    params.multipartFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    )
  } else if (body !== undefined) {
    params.body = body
  } else if (
    // POST/PUT/PATCH/DELETE with schema-defined body properties must send at minimum `{}`.
    // Kibana treats a missing body as `null` for these endpoints and rejects with
    // "expected a plain object value, but found [null]". GET/HEAD never carry a body.
    def.method !== 'GET' && def.method !== 'HEAD' &&
    !isMultipart &&
    schemaArgs.some((a) => a.foundIn === 'body' || a.foundIn === undefined)
  ) {
    params.body = {}
  }

  return params
}

/**
 * Collects request body fields. A single field marked `x-body-root` by
 * `@elastic/schemas` has its value promoted to be the whole body rather than nested
 * under the key -- 107 Kibana endpoints model their request body that way.
 *
 * Returns `undefined` when no body fields are present.
 */
function collectBody (
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): unknown {
  const body = routeBody(schemaArgs, input)
  // Also include any input keys that have no corresponding property definition
  const known = new Set(schemaArgs.map((a) => a.schemaKey))
  for (const [key, value] of Object.entries(input)) {
    if (!known.has(key) && value !== undefined) body[key] = value
  }
  const keys = Object.keys(body)
  if (keys.length === 0) return undefined
  const root = schemaArgs.find((a) => a.bodyRoot === true && a.schemaKey in body)
  if (keys.length === 1 && root != null) return body[root.schemaKey]
  return body
}
