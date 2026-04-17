/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KbApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import type { ParsedResult } from '../factory.ts'
import type { KibanaRequestParams } from '../lib/kibana-client.ts'

/**
 * Builds a `KibanaRequestParams` object from an API definition, parsed CLI input,
 * and the schema arg definitions extracted from `def.input`.
 *
 * Each `SchemaArgDefinition` carries a `foundIn` field that determines routing:
 * - `"path"` → value is interpolated into the URL path template
 * - `"query"` → value is added to the querystring
 * - `"body"` or `undefined` → value is collected into the request body
 *
 * @param def - the API definition describing the Kibana endpoint
 * @param parsed - the CLI-parsed result; all API params live in `parsed.input`
 * @param schemaArgs - arg definitions extracted from `def.input` at registration time
 * @returns `KibanaRequestParams` ready to pass to `KibanaClient.request()`
 */
export function buildKibanaRequestParams (
  def: KbApiDefinition,
  parsed: ParsedResult,
  schemaArgs: SchemaArgDefinition[]
): KibanaRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  const path = interpolatePath(def.path, schemaArgs, input)
  const querystring = buildQuerystring(schemaArgs, input)
  const body = collectBody(schemaArgs, input)

  const params: KibanaRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body

  return params
}

/**
 * Percent-encodes a single path parameter value.
 * Unlike the ES variant, Kibana IDs are single values (no comma-separated multi-target syntax).
 */
function encodePathParam (value: string): string {
  return encodeURIComponent(value)
}

/**
 * Interpolates `{param}` tokens in the path template using values from the unified input object.
 *
 * For optional params that are absent, trailing `/{param}` segments are stripped.
 */
function interpolatePath (
  path: string,
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): string {
  for (const arg of schemaArgs.filter((a) => a.foundIn === 'path')) {
    const value = input[arg.schemaKey]
    if (value !== undefined) {
      path = path.replace(`{${arg.schemaKey}}`, encodePathParam(String(value)))
    } else if (!arg.required) {
      path = path.replace(new RegExp(`/?\\{${arg.schemaKey}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

/**
 * Builds the querystring record from entries with `foundIn === "query"`.
 */
function buildQuerystring (
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): Record<string, unknown> {
  const qs: Record<string, unknown> = {}
  for (const arg of schemaArgs.filter((a) => a.foundIn === 'query')) {
    const value = input[arg.schemaKey]
    if (value !== undefined) qs[arg.schemaKey] = value
  }
  return qs
}

/**
 * Collects request body fields from entries with `foundIn === "body"` or no `foundIn`.
 * Returns `undefined` when no body fields are present in the input.
 */
function collectBody (
  schemaArgs: SchemaArgDefinition[],
  input: Record<string, unknown>
): Record<string, unknown> | undefined {
  const bodyArgs = schemaArgs.filter((a) => a.foundIn === 'body' || a.foundIn === undefined)
  const body: Record<string, unknown> = {}

  for (const arg of bodyArgs) {
    const value = input[arg.schemaKey]
    if (value !== undefined) body[arg.schemaKey] = value
  }

  return Object.keys(body).length === 0 ? undefined : body
}
