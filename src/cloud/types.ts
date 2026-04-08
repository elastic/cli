/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'

/**
 * Valid HTTP methods for Cloud control plane API requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * Describes a path parameter that gets interpolated into the URL template.
 *
 * @example
 * ```ts
 * const param: CloudPathParam = { name: 'deployment_id', description: 'Deployment ID', required: true }
 * ```
 */
export interface CloudPathParam {
  name: string
  description: string
  required: boolean
}

/**
 * Describes a query string parameter for a Cloud API request.
 *
 * The `name` field (snake_case) is used in the query string;
 * the `cliFlag` (kebab-case) is what users type on the command line.
 */
export interface CloudQueryParam {
  name: string
  cliFlag?: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
  defaultValue?: string | number | boolean
}

/**
 * Declarative description of a single Cloud control plane API endpoint.
 *
 * Covers both Elastic Cloud Hosted (deployments) and Serverless (projects)
 * APIs. Definitions are grouped by namespace and collected by the barrel
 * module (`src/cloud/apis/index.ts`).
 *
 * @example
 * ```ts
 * const listDef: CloudApiDefinition = {
 *   name: 'list',
 *   namespace: 'deployments',
 *   description: 'List all deployments',
 *   method: 'GET',
 *   path: '/api/v1/deployments',
 * }
 * ```
 */
export interface CloudApiDefinition {
  name: string
  namespace: string
  description: string
  method: HttpMethod
  path: string
  pathParams?: CloudPathParam[]
  queryParams?: CloudQueryParam[]
  body?: z.ZodObject<z.ZodRawShape>
}

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/
const VALID_NAMESPACE = /^[a-z][a-z-]*$/

function extractPathTokens(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Validates a `CloudApiDefinition` against the data-model rules.
 *
 * @throws {Error} if any validation rule is violated
 */
export function validateCloudApiDefinition(def: CloudApiDefinition): void {
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

  const schemaKeys = new Set<string>()
  const collisions: string[] = []

  for (const p of def.pathParams ?? []) {
    if (schemaKeys.has(p.name)) collisions.push(p.name)
    schemaKeys.add(p.name)
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
