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
  /** Path params that may be absent; absent required params throw instead. */
  optionalPathParams?: string[]
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
  /** Path params that may be absent; absent required params throw instead. */
  optionalPathParams?: string[]
  queryParams?: string[]
  /** Optional: which param name contains the request body (x-body-root). */
  bodyParam?: string
  /** Optional: override routing (x-found-in). */
  foundIn?: string
}

export interface CloudRequestParams {
  method: HttpMethod
  path: string
  querystring: Record<string, string>
  body?: unknown
}

/**
 * Converts a snake_case identifier to camelCase.
 * e.g. "api_key_id" -> "apiKeyId"
 */
function snakeToCamel (s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Extracts all placeholder names from a path template, e.g.
 * "/deployments/{deployment_id}/resources" -> ["deployment_id"]
 */
function extractTemplatePlaceholders (template: string): string[] {
  const found: string[] = []
  const re = /\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    if (m[1] != null) {
      found.push(m[1])
    }
  }
  return found
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

  // Use explicitly declared pathParams when provided; otherwise auto-extract
  // from the template so all {placeholder} tokens are resolved when present.
  const pathParamNames: string[] =
    (def.pathParams != null && def.pathParams.length > 0)
      ? def.pathParams
      : extractTemplatePlaceholders(pathTemplate)

  // Build a set of params that are explicitly declared optional.
  const optionalSet = new Set<string>(def.optionalPathParams ?? [])

  // Path params: coerce non-string scalars via String(); strip placeholder
  // only when value is absent AND the param is optional; throw for required
  // params that are missing; reject empty / dot-dot values.
  for (const param of pathParamNames) {
    const raw = getValue(param)
    if (raw === undefined || raw === null) {
      if (optionalSet.has(param)) {
        // Optional param: remove the placeholder and any adjacent slash.
        path = path.replace(new RegExp(`/?\\{${param}\\}`, 'g'), '')
        continue
      }
      // Required param missing — throw rather than widening the request.
      inputError(
        `Missing required path parameter "${param}"`
      )
    }
    const value = typeof raw === 'string' ? raw : String(raw)
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

  // x-found-in routing override: prepend an encoded prefix derived from the
  // param value. Each segment is validated against empty / dot-dot traversal.
  if (def.foundIn != null) {
    const override = getValue(def.foundIn)
    if (override !== undefined && override !== null) {
      const overrideStr = typeof override === 'string' ? override : String(override)
      if (overrideStr !== '') {
        const segments = overrideStr.replace(/^\//, '').split('/')
        for (const seg of segments) {
          if (seg === '' || seg === '.' || seg === '..') {
            inputError(
              `Invalid foundIn value "${overrideStr}": segment "${seg}" would traverse outside the expected path`
            )
          }
        }
        const encodedPrefix = segments.map((seg) => encodePathParam(seg)).join('/')
        path = `/${encodedPrefix}${path.startsWith('/') ? path : `/${path}`}`
      }
    }
  }

  // Query params: coerce number/boolean to string; skip absent/null values.
  const querystring: Record<string, string> = {}
  for (const param of def.queryParams ?? []) {
    const value = getValue(param)
    if (typeof value === 'string') {
      querystring[param] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      querystring[param] = String(value)
    }
  }

  // Body: use explicit bodyParam when declared; for mutating methods without
  // a bodyParam, collect keys not consumed by path/query/foundIn.
  let body: unknown
  const method = def.method
  if (def.bodyParam != null) {
    const v = getValue(def.bodyParam)
    if (v !== undefined) body = v
  } else if (
    (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') &&
    Object.keys(inputMap).length > 0
  ) {
    // Collect keys consumed by path/query params, accounting for both
    // snake_case names and their camelCase equivalents.
    const consumed = new Set<string>()
    for (const p of [...pathParamNames, ...(def.queryParams ?? [])]) {
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
    ? { method, path, querystring, body }
    : { method, path, querystring }
}
