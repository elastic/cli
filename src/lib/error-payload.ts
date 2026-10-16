/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory.ts'
import { AUTH_FAILURE_HINT } from '../output.ts'
import { ConnectionError, HttpResponseError } from './http-errors.ts'

/** The `error.code` each product reports for a failure that is not a connection error. */
export type ProductErrorCode = 'transport_error' | 'kibana_api_error' | 'cloud_api_error'

/** The message and optional hint a product reports for an error. */
export interface ErrorDetail {
  message: string
  hint?: string | undefined
}

/**
 * Per-product hook that derives the reported message and hint from the HTTP status (undefined
 * for non-HTTP errors), the error message, and the response body.
 */
export type DescribeError = (status: number | undefined, message: string, body: unknown) => ErrorDetail

/** Builds a `missing_config` error payload from a thrown error. */
export function missingConfigError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } }
}

/** Builds an `input_error` error payload from a thrown error. */
export function inputError (err: unknown): JsonValue {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'input_error', message } }
}

const TLS_HINTS = [
  /SSL routines/i,
  /wrong version number/i,
  /ssl3_get_record/i,
  /tls_get_more_records/i,
  /packet length too long/i,
  /EPROTO/i,
  /ERR_SSL/i,
]

function appendTlsHint (message: string): string {
  if (TLS_HINTS.some((re) => re.test(message))) {
    return message + '\n\nHint: this looks like a TLS/SSL error. If the service is running on plain HTTP, change the url in your config from https:// to http://.'
  }
  return message
}

function authHint (status: number | undefined): string | undefined {
  return status === 401 || status === 403 ? AUTH_FAILURE_HINT : undefined
}

const describeAuthError: DescribeError = (status, message) => ({ message, hint: authHint(status) })

/**
 * Builds the structured `{ error }` payload for an error thrown while calling a product API.
 *
 * `ConnectionError` maps to `connection_error` for every product. Elasticsearch HTTP errors
 * carry the parsed body and map 401/404 to `auth_required`/`not_found`. Every other error uses
 * `productCode`, with the message and hint from `describe` (by default, the auth hint on 401/403).
 */
export function toErrorPayload (err: unknown, productCode: ProductErrorCode, describe: DescribeError = describeAuthError): JsonValue {
  if (err instanceof ConnectionError) {
    return { error: { code: 'connection_error', message: appendTlsHint(err.message || 'connection failed') } }
  }

  if (err instanceof HttpResponseError && productCode === 'transport_error') {
    const code = err.statusCode === 401 ? 'auth_required' : err.statusCode === 404 ? 'not_found' : 'transport_error'
    const error: Record<string, JsonValue> = { code, status_code: err.statusCode, body: err.body as JsonValue ?? null }
    const hint = authHint(err.statusCode)
    if (hint != null) error.hint = hint
    return { error }
  }

  const http = err instanceof HttpResponseError ? err : undefined
  const status = http?.statusCode
  const { message, hint } = describe(status, err instanceof Error ? err.message : String(err), http?.body)
  const error: Record<string, JsonValue> = { code: productCode, message: status == null ? appendTlsHint(message) : message }
  if (status != null) error.status_code = status
  if (hint != null) error.hint = hint
  return { error }
}
