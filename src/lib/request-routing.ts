/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SchemaArgDefinition } from './json-schema-args.ts'

/**
 * Substitutes `{key}` tokens in a URL path template with encoded values.
 *
 * A segment that is exactly one `{key}` token with no value is dropped, so an
 * absent optional param in the middle of `/a/{x}/b` yields `/a/b`. Keys are
 * looked up as plain strings, never compiled into a regex, so a key like `a.b`
 * cannot match a different placeholder.
 *
 * @param template - path template, e.g. `/{index}/_doc/{id}`
 * @param values - lookup for token values; `undefined` means absent
 * @param encode - product-specific encoder applied to each substituted value
 * @returns the interpolated path, or `/` when every segment was dropped
 */
export function interpolatePath (
  template: string,
  values: Record<string, unknown>,
  encode: (value: string) => string
): string {
  const segments: string[] = []
  for (const segment of template.split('/')) {
    const whole = /^\{([^{}]+)\}$/.exec(segment)?.[1]
    if (whole !== undefined && values[whole] === undefined) continue
    segments.push(segment.replace(/\{([^{}]+)\}/g, (token, key: string) => {
      const value = values[key]
      return value === undefined ? token : encode(String(value))
    }))
  }
  return segments.join('/') || '/'
}

/**
 * Collects the query-routed args that have a value, keyed by schema key.
 *
 * Values are returned unserialized because the array wire format differs by
 * product, on purpose (#726). ES and Cloud send `q=a,b` (`String(value)`),
 * matching ES's comma-separated list params. Kibana sends the JSON form
 * `q=["a","b"]`, adopted in #598 for Fleet params such as `agentsIds`.
 */
export function routeQuery (args: SchemaArgDefinition[], input: Record<string, unknown>): Record<string, unknown> {
  return pick(args.filter((a) => a.foundIn === 'query'), input)
}

/** Collects the body-routed args (`x-found-in: body` or unset) that have a value, keyed by schema key. */
export function routeBody (args: SchemaArgDefinition[], input: Record<string, unknown>): Record<string, unknown> {
  return pick(args.filter((a) => a.foundIn === 'body' || a.foundIn === undefined), input)
}

function pick (args: SchemaArgDefinition[], input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const arg of args) {
    const value = input[arg.schemaKey]
    if (value !== undefined) out[arg.schemaKey] = value
  }
  return out
}
