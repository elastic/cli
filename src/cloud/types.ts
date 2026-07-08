/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Valid HTTP methods for Cloud control plane API requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * Describes a path parameter that gets interpolated into the URL template.
 */
export interface CloudPathParam {
  name: string
  description: string
  required: boolean
}

/**
 * Describes a query string parameter for a Cloud API request.
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
 * Describes a body parameter for a Cloud API request.
 */
export interface CloudBodyParam {
  name: string
  cliFlag?: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
}

/**
 * Declarative description of a single Cloud control plane API endpoint.
 */
export interface CloudApiDefinition {
  name: string
  namespace: string
  description: string
  method: HttpMethod
  path: string
  pathParams?: CloudPathParam[]
  queryParams?: CloudQueryParam[]
  /** Body parameters. For a passthrough body (stdin/--input-file), use an empty bodyParams array. */
  bodyParams?: CloudBodyParam[]
}

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/
const VALID_NAMESPACE = /^[a-z][a-z-]*$/

function extractPathTokens (path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Validates a `CloudApiDefinition` against the data-model rules.
 *
 * @throws {Error} if any validation rule is violated
 */
export function validateCloudApiDefinition (def: CloudApiDefinition): void {
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

  for (const b of def.bodyParams ?? []) {
    const key = b.cliFlag ?? b.name
    if (schemaKeys.has(key)) collisions.push(key)
    schemaKeys.add(key)
  }

  if (collisions.length > 0) {
    throw new Error(
      `schema key collision(s) in definition "${def.name}": ${collisions.join(', ')}. ` +
      'Use cliFlag to rename the conflicting query param, or restructure the definition to avoid the conflict.'
    )
  }
}

/**
 * Builds a JSON Schema object from a CloudApiDefinition's params.
 * Used by register.ts to pass to defineCommand as the input schema.
 */
export function buildCloudJsonSchema (def: CloudApiDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const p of def.pathParams ?? []) {
    const key = p.name
    properties[key] = {
      type: 'string',
      description: p.description,
      'x-found-in': 'path',
    }
    if (p.required) required.push(key)
  }

  for (const q of def.queryParams ?? []) {
    const key = q.cliFlag ?? q.name
    const jsonType = q.type === 'number' ? 'number' : q.type === 'boolean' ? 'boolean' : 'string'
    const prop: Record<string, unknown> = {
      type: jsonType,
      description: q.description,
      'x-found-in': 'query',
    }
    if (q.defaultValue !== undefined) prop['default'] = q.defaultValue
    properties[key] = prop
    if (q.required === true) required.push(key)
  }

  for (const b of def.bodyParams ?? []) {
    const key = b.cliFlag ?? b.name
    const jsonType = b.type === 'number' ? 'number' : b.type === 'boolean' ? 'boolean' :
      b.type === 'array' ? 'array' : b.type === 'object' ? 'object' : 'string'
    properties[key] = {
      type: jsonType,
      description: b.description,
      'x-found-in': 'body',
    }
    if (b.required === true) required.push(key)
  }

  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
  }
  if (required.length > 0) schema['required'] = required
  return schema
}
