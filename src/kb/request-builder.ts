/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import type { ParsedResult } from '../factory.ts'
import type { KibanaRequestParams } from '../lib/kibana-client.ts'

/**
 * Builds a `KibanaRequestParams` from an API definition and parsed CLI input.
 *
 * Routing is derived from `x-found-in` in the JSON Schema properties:
 * - `"path"` -> interpolated into URL path
 * - `"query"` -> sent as querystring
 * - `"body"` (or absent) -> collected into request body
 */
export function buildKibanaRequestParams (
  def: KbApiDefinition,
  parsed: ParsedResult
): KibanaRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>
  const props = ((def.input?.['properties'] ?? {}) as Record<string, Record<string, unknown>>)

  const path = interpolatePath(def.path, props, input)
  const querystring = buildQuerystring(props, input)

  const params: KibanaRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring

  const body = collectBody(props, input)
  // ponytail: any Kibana body containing a `file` field needs multipart, not JSON,
  // encoding -- e.g. saved-objects resolve-import-errors also requires a `retries`
  // field alongside `file`. Send every body field as a form field so none are dropped.
  // Add a schema signal (e.g. x-found-in: 'file') if this heuristic ever misfires.
  if (body !== undefined && typeof body['file'] === 'string') {
    params.multipartFields = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    )
  } else if (body !== undefined) {
    params.body = body
  }

  return params
}

function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}

function interpolatePath (
  path: string,
  props: Record<string, Record<string, unknown>>,
  input: Record<string, unknown>
): string {
  for (const [key, prop] of Object.entries(props)) {
    if (prop['x-found-in'] !== 'path') continue
    const value = input[key]
    const required = prop['required'] !== false
    if (value !== undefined) {
      path = path.replace(`{${key}}`, encodePathParam(String(value)))
    } else if (!required) {
      path = path.replace(new RegExp(`/?\\{${key}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

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

function collectBody (
  props: Record<string, Record<string, unknown>>,
  input: Record<string, unknown>
): Record<string, unknown> | undefined {
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
  return Object.keys(body).length > 0 ? body : undefined
}
