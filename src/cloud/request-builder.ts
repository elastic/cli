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

/**
 * Converts a snake_case identifier to camelCase.
 * e.g. "api_key_id" -> "apiKeyId"
 */
function snakeToCamel (s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
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

  // Options map from ParsedResult (Commander stores --foo-bar as fooBar here).
  const optionsMap: Record<string, unknown> =
    (parsed != null &&
      typeof parsed === 'object' &&
      'options' in parsed &&
      parsed.options != null &&
      typeof parsed.options === 'object')
      ? (parsed.options as Record<string, unknown>)
      : {}

  function getValue (param: string): unknown {
    // Try direct lookup first (snake_case as declared in the API spec).
    if (param in inputMap) return inputMap[param]
    // Fall back to camelCase lookup (Commander converts --foo-bar to fooBar,
    // and snake_case params like api_key_id may be stored as apiKeyId).
    const camel = snakeToCamel(param)
    if (camel !== param && camel in inputMap) return inputMap[camel]
    // Also check parsed.options (Commander stores CLI flags here).
    if (param in optionsMap) return optionsMap[param]
    if (camel !== param && camel in optionsMap) return optionsMap[camel]
    return undefined
  }

  // Path params
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

  // Verify no unresolved placeholders remain (catches missing pathParams entries).
  const unresolved = path.match(/\{[^}]+\}/g)
  if (unresolved != null) {
    inputError(`Unresolved path placeholders: ${unresolved.join(', ')}`)
  }

  // x-found-in routing override
  if (def.foundIn != null) {
    const override = getValue(def.foundIn)
    if (typeof override === 'string' && override !== '') {
      const encodedPrefix = override
        .replace(/^\//, '')
        .split('/')
        .map((seg) => encodePathParam(seg))
        .join('/')
      path = `/${encodedPrefix}${path.startsWith('/') ? path : `/${path}`}`
    }
  }

  // Query params
  const query: Record<string, string> = {}
  for (const param of def.queryParams ?? []) {
    const value = getValue(param)
    if (typeof value === 'string') {
      query[param] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      query[param] = String(value)
    }
  }

  // Body
  let body: unknown
  const method = def.method
  if (def.bodyParam != null) {
    const v = getValue(def.bodyParam)
    if (v !== undefined) body = v
  } else if (
    (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
    Object.keys(inputMap).length > 0
  ) {
    // Collect keys consumed by path/query params, accounting for both
    // snake_case names and their camelCase equivalents.
    const consumed = new Set<string>()
    for (const p of [...(def.pathParams ?? []), ...(def.queryParams ?? [])]) {
      consumed.add(p)
      consumed.add(snakeToCamel(p))
    }
    if (def.foundIn != null) {
      consumed.add(def.foundIn)
      consumed.add(snakeToCamel(def.foundIn))
    }
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
