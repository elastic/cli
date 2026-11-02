/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import type { CloudRequestParams } from '../lib/cloud-client.ts'
import type { ParsedResult } from '../factory.ts'
import type { SchemaArgDefinition } from '../lib/json-schema-args.ts'
import { encodePathParam } from '../lib/path-encoding.ts'
import { interpolatePath, requirePathParams, routeBody, routeQuery } from '../lib/request-routing.ts'

/**
 * Builds a `CloudRequestParams` object from an API definition and parsed CLI input.
 *
 * All path params, query params, and body fields arrive in `parsed.input` as a
 * single flat object. Each arg's `foundIn` (`x-found-in`) routes its key:
 * - `"path"` → interpolated into the URL path
 * - `"query"` → added to the querystring
 * - `"body"` or absent → included in the request body
 *
 * When the schema has no body args, POST/PUT/PATCH commands treat all non-path/
 * non-query fields as body fields (passthrough semantics).
 *
 * @param schemaArgs - arg definitions extracted from the resolved `def.input` at registration time
 */
export function buildCloudRequestParams (
  def: CloudApiDefinition,
  parsed: ParsedResult,
  schemaArgs: SchemaArgDefinition[],
): CloudRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  requirePathParams(schemaArgs, input)
  const path = interpolatePath(def.path, input, encodePathParam)
  const querystring = Object.fromEntries(
    Object.entries(routeQuery(schemaArgs, input)).map(([key, value]) => [key, String(value)])
  )
  const body = collectBody(def.method, schemaArgs, input)

  const params: CloudRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body
  return params
}

const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH'])

function collectBody (
  method: string,
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>,
): unknown {
  // Explicit body fields from schema take precedence over the method gate below:
  // some commands (e.g. delete-api-keys) send a required body on DELETE.
  if (schemaArgs.some((a) => a.foundIn === 'body' || a.foundIn === undefined)) {
    const body = routeBody(schemaArgs, input)
    const keys = Object.keys(body)
    if (keys.length === 0) return undefined
    // `x-body-root` marks a field whose value replaces the whole body (e.g.
    // patch-current-account's JSON Patch document).
    const root = schemaArgs.find((a) => a.bodyRoot === true && a.schemaKey in body)
    if (keys.length === 1 && root != null) return body[root.schemaKey]
    return body
  }

  if (!BODY_METHODS.has(method)) return undefined

  // Passthrough: no explicit body schema — use all non-path/non-query fields
  const reserved = new Set(schemaArgs.map((a) => a.schemaKey))
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!reserved.has(key) && value !== undefined) body[key] = value
  }
  return Object.keys(body).length > 0 ? body : undefined
}
