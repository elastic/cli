/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandIntent } from '../factory.ts'

/** Valid HTTP methods for Kibana API requests. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD'

/**
 * Declarative description of a single Kibana API endpoint.
 *
 * `input` is a plain JSON Schema object whose properties carry `x-found-in`
 * routing metadata (`"path"`, `"query"`, or `"body"`).
 */
export interface KbApiDefinition {
  name: string
  namespace: string
  description: string
  method: HttpMethod
  path: string
  /** JSON Schema object for request parameters (properties carry `x-found-in` routing). */
  input?: Record<string, unknown>
  /** When 'ndjson', the success response is newline-delimited JSON. */
  responseType?: 'json' | 'ndjson' | 'text'
  /** optional intent override */
  intent?: CommandIntent
}

// Keep for backward-compat with existing cloud/kb api files that declare params separately.
export interface KbPathParam {
  name: string
  description: string
  required: boolean
}

export interface KbQueryParam {
  name: string
  cliFlag?: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
}

export interface KbBodyParam {
  name: string
  cliFlag?: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
}

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/
const VALID_NAMESPACE = /^[a-z][a-z0-9-]*$/

function extractPathTokens (path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Validates a `KbApiDefinition` against the data-model rules.
 *
 * @throws {Error} if any validation rule is violated
 */
export function validateKbApiDefinition (def: KbApiDefinition): void {
  if (!VALID_NAME.test(def.name)) {
    throw new Error(
      `invalid name ${JSON.stringify(def.name)}: ` +
      'names must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens'
    )
  }

  if (!VALID_NAMESPACE.test(def.namespace)) {
    throw new Error(
      `invalid namespace ${JSON.stringify(def.namespace)}: ` +
      'namespaces must start with a lowercase letter and contain only lowercase letters, digits, and hyphens'
    )
  }

  if (!def.path.startsWith('/')) {
    throw new Error(`path must start with "/" — got ${JSON.stringify(def.path)}`)
  }

  if (def.input == null) return

  const tokens = extractPathTokens(def.path)
  const props = (def.input['properties'] as Record<string, Record<string, unknown>> | undefined) ?? {}
  const pathFields = new Set(
    Object.entries(props)
      .filter(([, v]) => v['x-found-in'] === 'path')
      .map(([k]) => k)
  )

  for (const token of tokens) {
    if (!pathFields.has(token)) {
      throw new Error(
        `path param {${token}} is not defined in input for definition ${JSON.stringify(def.name)}`
      )
    }
  }
}
