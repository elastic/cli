/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
