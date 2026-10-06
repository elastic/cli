/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { inputError } from '../api/path.ts'
import type { ParsedResult } from '../factory.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD'

export interface CloudRequestDef {
  method: HttpMethod
  pathTemplate: string
  pathParams?: string[]
  queryParams?: string[]
}

/** Definition shape used by generated cloud command handlers (uses `path` instead of `pathTemplate`). */
export interface CloudApiDefinition {
  method: HttpMethod
  path: string
  pathParams?: string[]
  queryParams?: string[]
}

export interface CloudRequestParams {
  method: HttpMethod
  path: string
  query: Record<string, string>
}

export function buildCloudRequestParams (
  def: CloudApiDefinition | CloudRequestDef,
  parsed: ParsedResult<unknown> | Record<string, unknown>
): CloudRequestParams {
  const pathTemplate = 'pathTemplate' in def ? def.pathTemplate : def.path
  let path = pathTemplate

  const parsedMap = parsed as Record<string, unknown>

  for (const param of def.pathParams ?? []) {
    const value = parsedMap[param]
    if (typeof value !== 'string') {
      inputError(`Missing required path parameter "${param}"`)
    }
    if (value === '') {
      inputError(`Invalid path parameter "${param}": empty string would widen the request scope instead of targeting a specific resource`)
    }
    if (value === '.' || value === '..') {
      inputError(`Invalid path parameter "${param}": value "${value}" resolves to the parent/root resource instead of a specific target`)
    }
    path = path.replace(`{${param}}`, encodeURIComponent(value))
  }

  const query: Record<string, string> = {}
  for (const param of def.queryParams ?? []) {
    const value = parsedMap[param]
    if (typeof value === 'string') {
      query[param] = value
    }
  }

  return { method: def.method, path, query }
}
