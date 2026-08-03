/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import type { CloudRequestParams } from '../lib/cloud-client.ts'
import type { ParsedResult } from '../factory.ts'
import { resolveRootRef } from '../lib/json-schema-refs.ts'

/**
 * Builds a `CloudRequestParams` object from an API definition and parsed CLI input.
 *
 * All path params, query params, and body fields arrive in `parsed.input` as a
 * single flat object. The `input.properties[key]['x-found-in']` annotation routes
 * each key:
 * - `"path"` → interpolated into the URL path
 * - `"query"` → added to the querystring
 * - `"body"` or absent → included in the request body
 *
 * When `input` is absent or empty, POST/PUT/PATCH commands treat all non-path/
 * non-query fields as body fields (passthrough semantics).
 */
export function buildCloudRequestParams (
  def: CloudApiDefinition,
  parsed: ParsedResult,
): CloudRequestParams {
  const rawInput = (parsed.input ?? {}) as Record<string, unknown>
  const resolvedInput = def.input != null ? resolveRootRef(def.input) : undefined
  const props = ((resolvedInput?.properties ?? {}) as Record<string, Record<string, unknown>>)

  const pathKeys = new Set<string>()
  const queryKeys = new Set<string>()
  const bodyKeys = new Set<string>()

  for (const [key, prop] of Object.entries(props)) {
    const loc = prop['x-found-in'] as string | undefined
    if (loc === 'path') pathKeys.add(key)
    else if (loc === 'query') queryKeys.add(key)
    else bodyKeys.add(key)
  }

  const required = new Set(Array.isArray(resolvedInput?.required) ? resolvedInput!.required as string[] : [])
  const path = interpolatePath(def.path, pathKeys, required, rawInput)
  const querystring = buildQuerystring(queryKeys, rawInput)
  const body = collectBody(def.method, pathKeys, queryKeys, bodyKeys, rawInput)

  const params: CloudRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body
  return params
}

function interpolatePath (
  template: string,
  pathKeys: Set<string>,
  required: Set<string>,
  input: Record<string, unknown>,
): string {
  let path = template
  for (const key of pathKeys) {
    const value = input[key]
    if (value !== undefined) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)))
    } else if (required.has(key)) {
      throw new Error(`missing required path parameter "${key}"`)
    } else {
      path = path.replace(new RegExp(`/?\\{${key}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

function buildQuerystring (
  queryKeys: Set<string>,
  input: Record<string, unknown>,
): Record<string, string> {
  const qs: Record<string, string> = {}
  for (const key of queryKeys) {
    const value = input[key]
    if (value !== undefined) qs[key] = String(value)
  }
  return qs
}

const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH'])

function collectBody (
  method: string,
  pathKeys: Set<string>,
  queryKeys: Set<string>,
  bodyKeys: Set<string>,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  // Explicit body fields from schema take precedence over the method gate below:
  // some commands (e.g. delete-api-keys) send a required body on DELETE.
  if (bodyKeys.size > 0) {
    const body: Record<string, unknown> = {}
    for (const key of bodyKeys) {
      if (input[key] !== undefined) body[key] = input[key]
    }
    return Object.keys(body).length > 0 ? body : undefined
  }

  if (!BODY_METHODS.has(method)) return undefined

  // Passthrough: no explicit body schema — use all non-path/non-query fields
  const reserved = new Set([...pathKeys, ...queryKeys])
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!reserved.has(key) && value !== undefined) body[key] = value
  }
  return Object.keys(body).length > 0 ? body : undefined
}
