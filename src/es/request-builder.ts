/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { TransportRequestParams } from '@elastic/transport'
import type { EsApiDefinition } from './types.ts'
import type { ParsedResult } from '../factory.ts'

/**
 * Builds a `TransportRequestParams` object from an API definition and parsed CLI input.
 *
 * All path params, query params, and body fields arrive together in `parsed.input` as a
 * single flat object — the unified schema built by `registerEsCommands` promotes every
 * parameter, including body fields, to the top level. The definition's param arrays act
 * as a routing manifest to classify each key back to its destination:
 *
 * - `pathParams` entries -> interpolated into the URL path (input key: `name`)
 * - `queryParams` entries → added to the querystring under the ES `name`
 *   (input key: `cliFlag ?? name`)
 * - `body` shape keys → collected and reconstructed into the request body object
 *
 * No keys from `parsed.options` are used — all user input for ES API commands flows through
 * `parsed.input` so the factory handles validation, coercion, and --file/stdin merging uniformly.
 *
 * @param def - the API definition describing the endpoint
 * @param parsed - the CLI-parsed result; all API params live in `parsed.input`
 * @returns `TransportRequestParams` ready to pass to `transport.request()`
 */
export function buildRequestParams(
  def: EsApiDefinition,
  parsed: ParsedResult,
): TransportRequestParams {
  const input = (parsed.input ?? {}) as Record<string, unknown>

  const path = interpolatePath(def, input)
  const querystring = buildQuerystring(def, input)
  const body = collectBody(def, input)

  const params: TransportRequestParams = { method: def.method, path }
  if (Object.keys(querystring).length > 0) params.querystring = querystring
  if (body !== undefined) params.body = body as NonNullable<TransportRequestParams['body']>
  return params
}

/**
 * Interpolates `{param}` tokens in the path template using values from the unified input object.
 * The input key is `name`; the path template token is always `name`.
 *
 * For optional params that are absent, trailing `/{param}` segments are stripped.
 */
function interpolatePath(
  def: EsApiDefinition,
  input: Record<string, unknown>,
): string {
  let path = def.path

  for (const param of def.pathParams ?? []) {
    const inputKey = param.name
    const value = input[inputKey]
    if (value !== undefined) {
      path = path.replace(`{${param.name}}`, String(value))
    } else if (!param.required) {
      // strip the trailing optional segment: e.g. "/_cat/shards/{index}" -> "/_cat/shards"
      path = path.replace(new RegExp(`/?\\{${param.name}\\}/?`), '')
      // clean up any trailing slash left behind
      path = path.replace(/\/$/, '') || '/'
    }
  }

  return path
}

/**
 * Builds the querystring record from `queryParams` entries present in the unified input object.
 * The input key is `cliFlag ?? name`; the querystring key is always the ES `name`.
 */
function buildQuerystring(
  def: EsApiDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const qs: Record<string, unknown> = {}

  for (const qp of def.queryParams ?? []) {
    const inputKey = qp.cliFlag ?? qp.name
    const value = input[inputKey]
    if (value !== undefined) {
      qs[qp.name] = value
    }
  }

  return qs
}

/**
 * Reconstructs the body object from the top-level body field keys in `parsed.input`.
 *
 * Since body fields are promoted to the top level of the unified schema, they arrive
 * alongside path and query params in `parsed.input`. This function collects only the
 * keys that belong to the body schema, ignoring path/query keys.
 *
 * Returns `undefined` when no body fields are present in the input, to avoid sending
 * an empty body object to Elasticsearch.
 */
function collectBody(
  def: EsApiDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!(def.body instanceof z.ZodObject)) return undefined

  const body: Record<string, unknown> = {}
  for (const fieldName of Object.keys(def.body.shape as Record<string, unknown>)) {
    if (input[fieldName] !== undefined) {
      body[fieldName] = input[fieldName]
    }
  }

  return Object.keys(body).length > 0 ? body : undefined
}
