/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { inputError } from '../api/path.ts'

export interface CloudRequestDef {
  method: string
  pathTemplate: string
  pathParams?: string[]
  queryParams?: string[]
}

export interface CloudRequestParams {
  method: string
  path: string
  query: Record<string, string>
}

export function buildCloudRequestParams (
  def: CloudRequestDef,
  parsed: Record<string, unknown>
): CloudRequestParams {
  let path = def.pathTemplate

  for (const param of def.pathParams ?? []) {
    const value = parsed[param]
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
    const value = parsed[param]
    if (typeof value === 'string') {
      query[param] = value
    }
  }

  return { method: def.method, path, query }
}
