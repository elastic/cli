/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SchemaArgDefinition } from '../lib/json-schema-args.ts'
import { extractSchemaArgs } from '../lib/json-schema-args.ts'
import type { CommandIntent } from '../factory.ts'

/**
 * Valid HTTP methods for Elasticsearch API requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

/**
 * Declarative description of a single Elasticsearch API endpoint.
 *
 * `input` is a plain JSON Schema object whose properties carry `x-found-in`
 * routing metadata (`"path"`, `"query"`, or `"body"`).
 *
 * @example
 * ```ts
 * const createDef: EsApiDefinition = {
 *   name: 'create',
 *   namespace: 'indices',
 *   description: 'Creates an index',
 *   method: 'PUT',
 *   path: '/{index}',
 *   input: {
 *     type: 'object',
 *     properties: {
 *       index: { type: 'string', description: 'Target index', 'x-found-in': 'path' },
 *       settings: { type: 'object', description: 'Index settings', 'x-found-in': 'body' },
 *     },
 *     required: ['index'],
 *   },
 * }
 * ```
 */
export interface EsApiDefinition {
  /** kebab-case command name (e.g. `"health"`, `"create"`, `"put-mapping"`) */
  name: string
  /**
   * ES namespace (e.g. `"cat"`, `"indices"`) — determines the parent group.
   * When omitted, the command is a direct leaf of the `es` group.
   */
  namespace?: string
  /** human-readable description for `--help` text */
  description: string
  /** HTTP method */
  method: HttpMethod
  /** URL path template; path parameters use `{param}` syntax */
  path: string
  /**
   * JSON Schema object describing the request parameters.
   * Properties carry `x-found-in: "path"|"query"|"body"` routing metadata.
   */
  input?: Record<string, unknown>
  /** how to handle the response body; defaults to `"json"` */
  responseType?: 'json' | 'text' | 'ndjson'
  /** how to serialize the request body; defaults to `"json"` */
  bodyFormat?: 'json' | 'ndjson'
  /** optional intent override */
  intent?: CommandIntent
}

/** valid command/namespace name: lowercase alphanumeric with hyphens */
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

/** valid namespace name: starts with lowercase letter, lowercase alphanumeric and hyphens */
const VALID_NAMESPACE = /^[a-z][a-z-]*$/

/** extracts all `{param}` tokens from a path template */
function extractPathTokens (path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Validates an `EsApiDefinition` against the data-model rules.
 *
 * @throws {Error} if any validation rule is violated
 */
export function validateApiDefinition (def: EsApiDefinition): SchemaArgDefinition[] {
  if (!VALID_NAME.test(def.name)) {
    throw new Error(
      `invalid name ${JSON.stringify(def.name)}: ` +
      'names must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens'
    )
  }

  if (def.namespace !== undefined && !VALID_NAMESPACE.test(def.namespace)) {
    throw new Error(
      `invalid namespace ${JSON.stringify(def.namespace)}: ` +
      'namespaces must start with a lowercase letter and contain only lowercase letters and hyphens'
    )
  }

  if (!def.path.startsWith('/')) {
    throw new Error(`path must start with "/" -- got ${JSON.stringify(def.path)}`)
  }

  if (def.input == null) return []

  const tokens = new Set(extractPathTokens(def.path))
  const args = extractSchemaArgs(def.input)
  const pathFields = new Set(args.filter((a) => a.foundIn === 'path').map((a) => a.schemaKey))

  for (const token of tokens) {
    if (!pathFields.has(token)) {
      throw new Error(
        `path param {${token}} in definition "${def.name}" has no input field with x-found-in: "path" -- ` +
        `add "x-found-in": "path" to the "${token}" field in the input schema`
      )
    }
  }

  for (const key of pathFields) {
    if (!tokens.has(key)) {
      throw new Error(
        `input field "${key}" has x-found-in: "path" but there is no {${key}} token in the path template for definition "${def.name}"`
      )
    }
  }

  return args
}
