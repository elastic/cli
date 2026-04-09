/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TransportRequestParams } from '@elastic/transport'
import type { EsApiDefinition } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import type { ParsedResult } from '../factory.ts'

/**
 * Builds a `TransportRequestParams` object from an API definition, parsed CLI input,
 * and the schema arg definitions extracted from `def.input`.
 *
 * Each `SchemaArgDefinition` carries a `foundIn` field that determines routing:
 * - `"path"` → value is interpolated into the URL path template
 * - `"query"` → value is added to the querystring (key = `schemaKey`, the snake_case ES name)
 * - `"body"` or `undefined` → value is collected into the request body object
 *
 * All user input arrives in `parsed.input` keyed by `schemaKey` (the snake_case schema
 * key), so no key translation is needed between CLI flags and destination param names.
 *
 * @param def - the API definition describing the endpoint
 * @param parsed - the CLI-parsed result; all API params live in `parsed.input`
 * @param schemaArgs - arg definitions extracted from `def.input` at registration time
 * @returns `TransportRequestParams` ready to pass to `transport.request()`
 */
export function buildRequestParams (
  def: EsApiDefinition,
  parsed: ParsedResult,
  schemaArgs: SchemaArgDefinition[]
): TransportRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  const path = interpolatePath(def.path, schemaArgs, input)
  const querystring = buildQuerystring(schemaArgs, input)
  const body = collectBody(schemaArgs, input)

  const params: TransportRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body as NonNullable<TransportRequestParams['body']>
  return params
}

/**
 * Interpolates `{param}` tokens in the path template using values from the unified input object.
 *
 * Only `SchemaArgDefinition` entries with `foundIn === "path"` are processed.
 * The schema key is both the `{token}` name in the template and the lookup key in `input`.
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
      path = path.replace(`{${arg.schemaKey}}`, String(value))
    } else if (!arg.required) {
      // strip the trailing optional segment: e.g. "/_cat/shards/{index}" -> "/_cat/shards"
      path = path.replace(new RegExp(`/?\\{${arg.schemaKey}\\}/?`), '')
      path = path.replace(/\/$/, '') || '/'
    }
  }
  return path
}

/**
 * Builds the querystring record from `SchemaArgDefinition` entries with `foundIn === "query"`.
 * The schema key is used as the ES-native querystring param name.
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

  return Object.keys(body).length > 0 ? body : undefined
}
