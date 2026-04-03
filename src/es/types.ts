/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'

/**
 * Valid HTTP methods for Elasticsearch API requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

/**
 * Describes a path parameter that gets interpolated into the URL template.
 *
 * Path params are folded into the unified command schema as string fields and
 * registered as `--flags` by the factory. Required params produce required schema
 * fields; optional params produce optional fields.
 *
 * @example
 * ```ts
 * const param: EsPathParam = { name: 'index', description: 'Target index', required: true }
 * ```
 */
export interface EsPathParam {
  /** parameter name matching the `{name}` token in the path template */
  name: string
  /** human-readable description for help text */
  description: string
  /** whether the parameter must be provided */
  required: boolean
}

/**
 * Describes a query string parameter for an Elasticsearch API request.
 *
 * The `name` field (snake_case) is used in the ES query string;
 * the `cliFlag` (kebab-case) is what users type on the command line.
 *
 * @example
 * ```ts
 * const param: EsQueryParam = {
 *   name: 'format',
 *   cliFlag: 'response-format',
 *   type: 'string',
 *   description: 'Response format',
 * }
 * ```
 */
export interface EsQueryParam {
  /** query parameter name as sent to Elasticsearch (snake_case) */
  name: string
  /** override kebab-case CLI flag name; auto-derived from `name` if omitted */
  cliFlag?: string
  /** value type for parsing and validation */
  type: 'string' | 'number' | 'boolean'
  /** human-readable description for help text */
  description: string
  /** whether the parameter must be provided; defaults to `false` */
  required?: boolean
  /** default value when not provided */
  defaultValue?: string | number | boolean
}

/**
 * Declarative description of a single Elasticsearch API endpoint.
 *
 * Each API definition specifies the HTTP method, path template, parameters,
 * optional body schema, and response handling strategy. The generic handler
 * derives its behavior entirely from this definition at runtime.
 *
 * Definitions are grouped into per-namespace arrays (e.g. `catApis`) and
 * collected by the barrel module (`src/es/apis/index.ts`).
 *
 * @example
 * ```ts
 * const healthDef: EsApiDefinition = {
 *   name: 'health',
 *   namespace: 'cat',
 *   description: 'Returns the health status of the cluster',
 *   method: 'GET',
 *   path: '/_cat/health',
 *   queryParams: [{ name: 'v', type: 'boolean', description: 'Show column headings' }],
 *   responseType: 'text',
 * }
 * ```
 */
export interface EsApiDefinition {
  /** kebab-case command name (e.g. `"health"`, `"create"`, `"put-mapping"`) */
  name: string
  /** ES namespace (e.g. `"cat"`, `"indices"`) — determines the parent group in the command tree */
  namespace: string
  /** human-readable description for `--help` text */
  description: string
  /** HTTP method */
  method: HttpMethod
  /** URL path template; path parameters use `{param}` syntax */
  path: string
  /** path parameter definitions; defaults to `[]` */
  pathParams?: EsPathParam[]
  /** query parameter definitions; defaults to `[]` */
  queryParams?: EsQueryParam[]
  /**
   * Zod object schema for the request body. Each top-level field is promoted
   * to the unified command schema as its own `--flag`. Absent for bodyless APIs
   * and for APIs whose body is free-form (use `--file` or stdin for those).
   */
  body?: z.ZodObject<z.ZodRawShape>
  /** how to handle the response body; defaults to `"json"` */
  responseType?: 'json' | 'text'
}

/** valid command/namespace name: lowercase alphanumeric with hyphens (from `defineCommand` rules) */
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

/** valid namespace name: starts with lowercase letter, lowercase alphanumeric and hyphens */
const VALID_NAMESPACE = /^[a-z][a-z-]*$/

/** extracts all `{param}` tokens from a path template */
function extractPathTokens(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Validates an `EsApiDefinition` against the data-model rules.
 *
 * Checks:
 * - `name` matches `/^[a-z0-9][a-z0-9-]*$/`
 * - `namespace` matches `/^[a-z][a-z-]*$/`
 * - `path` starts with `/`
 * - all `{param}` tokens in path have a corresponding `pathParams` entry
 * - each `required: true` pathParam has a corresponding `{param}` in path
 * - no schema key collisions across path params, query params, and body fields
 *   (use `cliFlag` on query params or restructure the definition to resolve)
 *
 * @throws {Error} if any validation rule is violated
 */
export function validateApiDefinition(def: EsApiDefinition): void {
  if (!VALID_NAME.test(def.name)) {
    throw new Error(
      `invalid name ${JSON.stringify(def.name)}: ` +
      'names must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens'
    )
  }

  if (!VALID_NAMESPACE.test(def.namespace)) {
    throw new Error(
      `invalid namespace ${JSON.stringify(def.namespace)}: ` +
      'namespaces must start with a lowercase letter and contain only lowercase letters and hyphens'
    )
  }

  if (!def.path.startsWith('/')) {
    throw new Error(`path must start with "/" — got ${JSON.stringify(def.path)}`)
  }

  const tokens = extractPathTokens(def.path)
  const paramNames = new Set((def.pathParams ?? []).map((p) => p.name))

  for (const token of tokens) {
    if (!paramNames.has(token)) {
      throw new Error(
        `path param {${token}} is not defined in pathParams for definition ${JSON.stringify(def.name)}`
      )
    }
  }

  const pathSet = new Set(tokens)
  for (const param of def.pathParams ?? []) {
    if (param.required && !pathSet.has(param.name)) {
      throw new Error(
        `required pathParam "${param.name}" is not in path template for definition ${JSON.stringify(def.name)}`
      )
    }
  }

  // check for schema key collisions across the unified flat schema
  const schemaKeys = new Set<string>()
  const collisions: string[] = []

  for (const p of def.pathParams ?? []) {
    const key = p.name
    if (schemaKeys.has(key)) collisions.push(key)
    schemaKeys.add(key)
  }

  for (const q of def.queryParams ?? []) {
    const key = q.cliFlag ?? q.name
    if (schemaKeys.has(key)) collisions.push(key)
    schemaKeys.add(key)
  }

  if (def.body != null) {
    for (const fieldName of Object.keys(def.body.shape as Record<string, unknown>)) {
      if (schemaKeys.has(fieldName)) collisions.push(fieldName)
      schemaKeys.add(fieldName)
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `schema key collision(s) in definition "${def.name}": ${collisions.join(', ')}. ` +
      'Use cliFlag to rename the conflicting query param, or restructure the definition to avoid the conflict.'
    )
  }
}
