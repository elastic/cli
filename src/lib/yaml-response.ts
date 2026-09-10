/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Marks an HTTP response body that was served as YAML (`Content-Type: application/yaml`
 * or `text/yaml`).
 *
 * YAML bodies are printed verbatim by default and parsed into JSON only when the user
 * passes `--json`. Wrapping the raw text in this marker lets the output layer defer that
 * decision instead of committing to one representation inside the client.
 */
export class YamlResponse {
  readonly text: string

  constructor (text: string) {
    this.text = text
  }
}

/** Returns true when a response `Content-Type` indicates a YAML body. */
export function isYamlContentType (contentType: string): boolean {
  return contentType.includes('yaml')
}
