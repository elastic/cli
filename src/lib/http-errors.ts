/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// `name` stays "Error" on both classes so messages read "Error: Kibana API error 404: ..."

/** Thrown when an API responds with a non-2xx status; carries the status code and decoded body. */
export class HttpResponseError extends Error {
  statusCode: number
  body: unknown

  /**
   * @param statusCode HTTP status of the response
   * @param body response body as the client decoded it (parsed JSON or raw text)
   * @param message defaults to the body's `error` field (as JSON) or the body as a string
   */
  constructor (statusCode: number, body: unknown, message?: string) {
    super(message ?? (body != null && typeof body === 'object' && 'error' in body
      ? JSON.stringify((body as Record<string, unknown>).error)
      : String(body)))
    this.statusCode = statusCode
    this.body = body
  }
}

/** Thrown when a request never reached the server (DNS, TLS, refused connection). */
export class ConnectionError extends Error {
  constructor (message: string, cause?: unknown) {
    super(message, { cause })
  }
}
