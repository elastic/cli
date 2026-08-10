/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { CloudApiDefinition, HttpMethod } from '@elastic/schemas/cloud/tools/types.js'
import type { CloudApiDefinition } from '@elastic/schemas/cloud/tools/types.js'
import { resolveRootRef } from '../lib/json-schema-refs.ts'

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
  const resolvedInput = def.input != null ? resolveRootRef(def.input) : undefined
  const props = (resolvedInput?.properties ?? {}) as Record<string, Record<string, unknown>>
  const pathParamNames = new Set(
    Object.entries(props)
      .filter(([, v]) => v['x-found-in'] === 'path')
      .map(([k]) => k)
  )

  for (const token of tokens) {
    if (!pathParamNames.has(token)) {
      throw new Error(
        `path param {${token}} is not defined in input.properties for definition ${JSON.stringify(def.name)}`
      )
    }
  }

  const pathSet = new Set(tokens)
  for (const [key, prop] of Object.entries(props)) {
    if (prop['x-found-in'] === 'path' && (resolvedInput?.required as string[] | undefined)?.includes(key)) {
      if (!pathSet.has(key)) {
        throw new Error(
          `required pathParam "${key}" is not in path template for definition ${JSON.stringify(def.name)}`
        )
      }
    }
  }
}

/**
 * Builds a JSON Schema object from a CloudApiDefinition's `input`.
 * Strips `x-found-in` from the returned schema since it is an internal
 * routing annotation and must not appear in help text or error messages.
 */
export function buildCloudJsonSchema (def: CloudApiDefinition): Record<string, unknown> {
  if (def.input == null) return { type: 'object', properties: {}, additionalProperties: false }

  const resolved = resolveRootRef(def.input)
  const props = (resolved.properties ?? {}) as Record<string, Record<string, unknown>>
  const cleaned: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(props)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { 'x-found-in': _routing, ...rest } = prop
    cleaned[key] = rest
  }

  // additionalProperties: false — unknown input keys must be named in a validation
  // error, not silently stripped. Upstream cloud definitions never set it themselves.
  const schema: Record<string, unknown> = { type: 'object', properties: cleaned, additionalProperties: false }
  if (Array.isArray(resolved.required) && (resolved.required as unknown[]).length > 0) {
    schema['required'] = resolved.required
  }
  // Preserve $defs so nested $refs inside property schemas (e.g. RoleAssignments) still resolve.
  if (resolved['$defs'] != null && Object.keys(resolved['$defs'] as Record<string, unknown>).length > 0) {
    schema['$defs'] = resolved['$defs']
  }
  return schema
}
