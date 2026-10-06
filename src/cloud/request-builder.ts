/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { inputError } from '../api/path.ts'
import { encodePathParam } from '../lib/path-encoding.ts'
import type { ParsedResult } from '../factory.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD'

export interface CloudRequestDef {
  method: HttpMethod
  pathTemplate: string
  pathParams?: string[]
  queryParams?: string[]
  /** Optional: which param name contains the request body (x-body-root). */
  bodyParam?: string
  /** Optional: override routing (x-found-in). */
  foundIn?: string
}

/** Definition shape used by generated cloud command handlers (uses `path` instead of `pathTemplate`). */
export interface CloudApiDefinition {
  method: HttpMethod
  path: string
  pathParams?: string[]
  queryParams?: string[]
  /** Optional: which param name contains the request body (x-body-root). */
  bodyParam?: string
  /** Optional: override routing (x-found-in). */
  foundIn?: string
}

export interface CloudRequestParams {
  method: HttpMethod
  path: string
  query: Record<string, string>
  body?: unknown
}

export function buildCloudRequestParams (
  def: CloudApiDefinition | CloudRequestDef,
  parsed: ParsedResult<unknown> | Record<string, unknown>
): CloudRequestParams {
  const pathTemplate = 'pathTemplate' in def ? def.pathTemplate : def.path
  let path = pathTemplate

  // Prefer parsed.input (the canonical location in ParsedResult) then fall
  // back to a plain Record when callers pass a raw object directly.
  const inputMap: Record<string, unknown> =
    (parsed != null &&
      typeof parsed === 'object' &&
      'input' in parsed &&
      parsed.input != null &&
      typeof parsed.input === 'object')
      ? (parsed.input as Record<string, unknown>)
      : (parsed as Record<string, unknown>)

  function getValue (param: string): unknown {
    return inputMap[param]
  }

  // ── Path params ────────────────────────────────────────────────────────────
  for (const param of def.pathParams ?? []) {
    const value = getValue(param)
    if (typeof value !== 'string') {
      inputError(`Missing required path parameter "${param}"`)
    }
    if (value === '') {
      inputError(
        `Invalid path parameter "${param}": empty string would widen the request scope instead of targeting a specific resource`
      )
    }
    if (value === '.' || value === '..') {
      inputError(
        `Invalid path parameter "${param}": value "${value}" resolves to the parent/root resource instead of a specific target`
      )
    }
    path = path.replace(`{${param}}`, encodePathParam(value))
  }

  // ── x-found-in routing override ────────────────────────────────────────────
  if (def.foundIn != null) {
    const override = getValue(def.foundIn)
    if (typeof override === 'string' && override !== '') {
      path = `/${override.replace(/^\//, '')}${path.startsWith('/') ? path : `/${path}`}`
    }
  }

  // ── Query params ───────────────────────────────────────────────────────────
  const query: Record<string, string> = {}
  for (const param of def.queryParams ?? []) {
    const value = getValue(param)
    if (typeof value === 'string') {
      query[param] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      query[param] = String(value)
    }
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  // 1. Explicit x-body-root param.
  // 2. For passthrough POST/PUT/PATCH with no bodyParam, forward the entire
  //    input as the body so that callers do not have to know the schema shape.
  let body: unknown
  const method = def.method
  if (def.bodyParam != null) {
    const v = getValue(def.bodyParam)
    if (v !== undefined) body = v
  } else if (
    (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') &&
    Object.keys(inputMap).length > 0
  ) {
    // Collect keys that were not already consumed by path or query params.
    const consumed = new Set<string>([...(def.pathParams ?? []), ...(def.queryParams ?? [])])
    if (def.foundIn != null) consumed.add(def.foundIn)
    const bodyKeys = Object.keys(inputMap).filter((k) => !consumed.has(k))
    if (bodyKeys.length > 0) {
      const bodyObj: Record<string, unknown> = {}
      for (const k of bodyKeys) bodyObj[k] = inputMap[k]
      body = bodyObj
    }
  }

  return body !== undefined
    ? { method, path, query, body }
    : { method, path, query }
}
