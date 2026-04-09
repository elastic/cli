/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { CloudApiDefinition } from './types.ts'
import type { CloudRequestParams } from '../lib/cloud-client.ts'
import type { ParsedResult } from '../factory.ts'

/**
 * Builds a `CloudRequestParams` object from an API definition and parsed CLI input.
 *
 * All path params, query params, and body fields arrive in `parsed.input` as a
 * single flat object. The definition's param arrays act as a routing manifest
 * to classify each key back to its destination:
 *
 * - `pathParams` → interpolated into the URL path
 * - `queryParams` → added to the querystring (stringified for fetch)
 * - `body` shape keys → collected into the request body object
 */
export function buildCloudRequestParams(
  def: CloudApiDefinition,
  parsed: ParsedResult,
): CloudRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  const path = interpolatePath(def, input)
  const querystring = buildQuerystring(def, input)
  const body = collectBody(def, input)

  const params: CloudRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body
  return params
}

function interpolatePath(
  def: CloudApiDefinition,
  input: Record<string, unknown>,
): string {
  let path = def.path

  for (const param of def.pathParams ?? []) {
    const value = input[param.name]
    if (value !== undefined) {
      path = path.replace(`{${param.name}}`, String(value))
    } else if (!param.required) {
      path = path.replace(new RegExp(`/?\\{${param.name}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }

  return path
}

function buildQuerystring(
  def: CloudApiDefinition,
  input: Record<string, unknown>,
): Record<string, string> {
  const qs: Record<string, string> = {}

  for (const qp of def.queryParams ?? []) {
    const inputKey = qp.cliFlag ?? qp.name
    const value = input[inputKey]
    if (value !== undefined) {
      qs[qp.name] = String(value)
    }
  }

  return qs
}

function collectBody(
  def: CloudApiDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!(def.body instanceof z.ZodObject)) return undefined

  const body: Record<string, unknown> = {}
  for (const fieldName of Object.keys(def.body.shape as Record<string, unknown>)) {
    if (input[fieldName] !== undefined) {
      body[fieldName] = input[fieldName]
    }
  }

  return Object.keys(body).length > 0 ? body : undefined
}
