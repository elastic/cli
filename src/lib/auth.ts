/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auth header construction shared by every HTTP client that talks to an Elastic
 * service. Keeping this in one place ensures `EsClient`, `KibanaClient`, and the
 * `elastic status` probes all encode credentials identically.
 */

/**
 * Either of the auth variants accepted by Elastic services that support both:
 * an API key, or HTTP Basic (username + password).
 */
export type ApiKeyOrBasicAuth = { api_key: string } | { username: string; password: string }

/**
 * Constructs an HTTP `Authorization` header value from a service-block auth
 * object. Returns `undefined` when no auth is configured (security disabled).
 */
export function buildAuthHeader (auth: ApiKeyOrBasicAuth | undefined): string | undefined {
  if (auth == null) return undefined
  if ('api_key' in auth) return `ApiKey ${auth.api_key}`
  const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
  return `Basic ${encoded}`
}
