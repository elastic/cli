/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'
import { extractSchemaArgs } from '../lib/schema-args.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'

/** Valid HTTP methods for Kibana API requests. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

/**
 * Declarative description of a single Kibana API endpoint.
 *
 * Follows the same shape as `EsApiDefinition` but targets the Kibana API:
 * each field in `input` carries `.meta({found_in: "path"|"query"|"body"})` routing
 * metadata, and the handler uses a fetch-based `KibanaClient` rather than
 * `@elastic/transport`.
 *
 * @example
 * ```ts
 * // namespaced: registers as `elastic kb lens get`
 * const getDef: KbApiDefinition = {
 *   name: 'get',
 *   namespace: 'lens',
 *   description: 'Get a Lens visualization by ID.',
 *   method: 'GET',
 *   path: '/api/saved_objects/lens/{id}',
 *   input: z.object({
 *     id: z.string().meta({ description: 'Visualization ID', found_in: 'path' }),
 *   }),
 * }
 * ```
 */
export interface KbApiDefinition {
  /** kebab-case command name (e.g. `"list"`, `"get"`, `"create"`) */
  name: string
  /**
   * Kibana namespace (e.g. `"lens"`, `"dashboard"`) -- determines the parent group.
   * When omitted, the command is registered as a direct leaf of the `kb` group.
   */
  namespace?: string
  /** human-readable description for `--help` text */
  description: string
  /** HTTP method */
  method: HttpMethod
  /** URL path template; path parameters use `{param}` syntax */
  path: string
  /**
   * Unified Zod object schema (or a no-arg factory that returns one).
   * Every top-level field represents one parameter.
   * Fields with `.meta({found_in: "path"})` are interpolated into the URL path.
   * Fields with `.meta({found_in: "query"})` are sent as querystring params.
   * Fields with `.meta({found_in: "body"})` (or no `found_in`) are sent in the body.
   */
  input?: z.ZodObject<z.ZodRawShape> | (() => z.ZodObject<z.ZodRawShape>)
  /** how to handle the response body; defaults to `"json"` */
  responseType?: 'json' | 'text'
}

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/
const VALID_NAMESPACE = /^[a-z][a-z-]*$/

function extractPathTokens (path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
}

/**
 * Resolves `def.input` to a concrete `ZodObject`, calling the factory thunk if necessary.
 */
export function resolveInput (
  input: z.ZodObject<z.ZodRawShape> | (() => z.ZodObject<z.ZodRawShape>)
): z.ZodObject<z.ZodRawShape> {
  return typeof input === 'function' ? input() : input
}

/**
 * Validates a `KbApiDefinition` against the data-model rules.
 *
 * Checks name/namespace format, path prefix, and path param ↔ input field alignment.
 *
 * @throws {Error} if any validation rule is violated
 * @returns the extracted `SchemaArgDefinition[]` (avoids re-running `extractSchemaArgs` later)
 */
export function validateKbApiDefinition (def: KbApiDefinition): SchemaArgDefinition[] {
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
  const args = extractSchemaArgs(resolveInput(def.input))
  const pathFields = new Set(args.filter((a) => a.foundIn === 'path').map((a) => a.schemaKey))

  for (const token of tokens) {
    if (!pathFields.has(token)) {
      throw new Error(
        `path param {${token}} in definition "${def.name}" has no input field with found_in: "path" -- ` +
        `add .meta({ found_in: "path" }) to the "${token}" field in the input schema`
      )
    }
  }

  for (const key of pathFields) {
    if (!tokens.has(key)) {
      throw new Error(
        `input field "${key}" has found_in: "path" but there is no {${key}} token in the path template for definition "${def.name}"`
      )
    }
  }

  return args
}
