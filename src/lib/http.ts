/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory-core.ts'

const REDACTED_HEADERS = new Set([
  'authentication-info',
  'authorization',
  'cookie',
  'proxy-authenticate',
  'proxy-authentication-info',
  'proxy-authorization',
  'set-cookie',
  'www-authenticate',
  'x-api-key',
])

const REDACTED_VALUE = '(redacted)'

// Credential fields exposed by the Elasticsearch, Kibana, and Cloud APIs.
const REDACTED_JSON_FIELDS = new Set([
  'accesskey',
  'accesstoken',
  'apikey',
  'apikeys',
  'authorization',
  'clientsecret',
  'clustercredentials',
  'credential',
  'credentials',
  'encoded',
  'enroltoken',
  'enrollmenttoken',
  'httpcakey',
  'invitationtoken',
  'invitationtokens',
  'kerberosauthenticationresponsetoken',
  'kerberosticket',
  'langsmithapikey',
  'nodescredentials',
  'password',
  'passwordhash',
  'privatekey',
  'refreshtoken',
  'relaystate',
  'secret',
  'secretkey',
  'secretparameters',
  'secrets',
  'secrettoken',
  'securesettingspassword',
  'sessionstate',
  'serviceaccounttoken',
  'servicetoken',
  'transportkey',
  'uninstalltoken',
])

const GENERIC_TOKEN_FIELDS = new Set(['token', 'tokens'])
const REDACTED_URL_FIELDS = new Set([...REDACTED_JSON_FIELDS, ...GENERIC_TOKEN_FIELDS, 'code', 'state'])

/**
 * Per-request behavior for {@link apiFetch}.
 */
export interface FetchOptions {
  debug?: boolean
}

let cliDebugEnabled = false
let jsonDebugMode = false
const bufferedDebugStatements: string[] = []

/**
 * Enables or disables HTTP debugging for the current CLI process.
 */
export function setHttpDebugEnabled (enabled: boolean): void {
  cliDebugEnabled = enabled
}

/**
 * Returns whether HTTP debug output is enabled by CLI flag or environment.
 */
export function isHttpDebugEnabled (): boolean {
  return cliDebugEnabled || process.env['ELASTIC_DEBUG'] === '1'
}

/**
 * Buffers HTTP diagnostics for structured output instead of writing to stderr.
 */
export function setHttpDebugJsonMode (enabled: boolean): void {
  jsonDebugMode = enabled
  bufferedDebugStatements.length = 0
}

function writeDebugStatement (statement: string): void {
  if (jsonDebugMode) {
    bufferedDebugStatements.push(statement)
  } else {
    process.stderr.write(`${statement}\n`)
  }
}

function writeHeaders (prefix: string, headers: RequestInit['headers']): void {
  for (const [name, value] of new Headers(headers)) {
    const printableValue = REDACTED_HEADERS.has(name.toLowerCase()) ? REDACTED_VALUE : value
    writeDebugStatement(`${prefix} ${name}: ${printableValue}`)
  }
}

function normalizedFieldName (name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function redactJsonValue (value: unknown, redactGenericTokens: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactJsonValue(item, redactGenericTokens))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, fieldValue]) => {
      const normalizedName = normalizedFieldName(name)
      const isSensitive = REDACTED_JSON_FIELDS.has(normalizedName) ||
        (redactGenericTokens && GENERIC_TOKEN_FIELDS.has(normalizedName))
      return [
        name,
        isSensitive ? REDACTED_VALUE : redactJsonValue(fieldValue, redactGenericTokens),
      ]
    })
  )
}

function urlCarriesCredentialTokens (url: string): boolean {
  let normalizedUrl: string
  try {
    normalizedUrl = new URL(url).pathname.toLowerCase()
  } catch {
    normalizedUrl = url.toLowerCase()
  }
  return [
    '/credential',
    '/enroll',
    '/oauth',
    '/oidc',
    '/saml',
    '/token',
    '/tokens',
  ].some(pathPart => normalizedUrl.includes(pathPart))
}

function redactBody (body: string, url: string): string {
  const redactGenericTokens = urlCarriesCredentialTokens(url)
  try {
    return JSON.stringify(redactJsonValue(JSON.parse(body), redactGenericTokens))
  } catch {
    const lines = body.split('\n')
    if (lines.length === 1) return body

    try {
      return lines
        .map(line => line.trim().length === 0
          ? line
          : JSON.stringify(redactJsonValue(JSON.parse(line), redactGenericTokens)))
        .join('\n')
    } catch {
      return body
    }
  }
}

function redactUrl (url: string): string {
  try {
    const parsed = new URL(url)
    let changed = false

    if (parsed.username.length > 0 || parsed.password.length > 0) {
      parsed.username = REDACTED_VALUE
      parsed.password = REDACTED_VALUE
      changed = true
    }

    const segments = parsed.pathname.split('/')
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (segments[index]?.toLowerCase() === 'invitations') {
        segments[index + 1] = REDACTED_VALUE
        changed = true
      }
    }
    parsed.pathname = segments.join('/')

    for (const name of parsed.searchParams.keys()) {
      if (REDACTED_URL_FIELDS.has(normalizedFieldName(name))) {
        parsed.searchParams.set(name, REDACTED_VALUE)
        changed = true
      }
    }

    if (!changed) return url
    return parsed.toString().replaceAll('%28redacted%29', REDACTED_VALUE)
  } catch {
    return url
  }
}

/**
 * Adds buffered HTTP diagnostics to a structured command result and clears the buffer.
 *
 * Object results keep their existing top-level shape. Primitive, array, or
 * pre-existing `debug` results are wrapped under `result` to avoid data loss.
 */
export function attachHttpDebug (value: JsonValue): JsonValue {
  const debug = bufferedDebugStatements.splice(0)
  if (debug.length === 0) return value

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'debug')) {
    return { ...value, debug }
  }
  return { result: value, debug }
}

/**
 * Executes an API request with optional request and response diagnostics.
 *
 * Credential-bearing headers are redacted case-insensitively. In text mode,
 * diagnostics go to stderr. In JSON mode, they are buffered for
 * {@link attachHttpDebug}. The response is cloned before inspection so callers
 * can consume the original body.
 */
export async function apiFetch (
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  options: FetchOptions = {}
): Promise<Response> {
  if (options.debug !== true) {
    return fetchImplementation(url, init)
  }

  writeDebugStatement(`> ${init.method ?? 'GET'} ${redactUrl(url)}`)
  writeHeaders('>', init.headers)
  if (typeof init.body === 'string') {
    writeDebugStatement(redactBody(init.body, url))
  }

  let response: Response
  try {
    response = await fetchImplementation(url, init)
  } catch (error) {
    writeDebugStatement(`< Request failed: ${String(error)}`)
    throw error
  }

  const statusText = response.statusText.length > 0 ? ` ${response.statusText}` : ''
  writeDebugStatement(`< ${response.status}${statusText}`)
  writeHeaders('<', response.headers)

  try {
    const body = await response.clone().text()
    if (body.length > 0) {
      writeDebugStatement(redactBody(body, url))
    }
  } catch (error) {
    writeDebugStatement(`< Response body unavailable: ${String(error)}`)
  }

  return response
}
