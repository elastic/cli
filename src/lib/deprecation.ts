/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Surfaces upstream `x-deprecated` annotations in help text and runtime warnings.
 *
 * Upstream schemas mark deprecations as `{ since: '8.11.0' }`, `{ since, description }`,
 * a plain string, or an empty object (which means NOT deprecated). This module
 * normalizes those shapes into short human notes; an empty object yields nothing.
 */

/** Extracts a short note from an `x-deprecated` annotation, if it marks a real deprecation. */
export function deprecationNote (raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw || undefined
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>
    const since = rec['since']
    if (typeof since === 'string' && since) return `since ${since}`
    const description = rec['description']
    if (typeof description === 'string' && description) return description
  }
  return undefined
}

/** Reads the deprecation note off an API definition, if it carries one. */
export function commandDeprecation (def: unknown): string | undefined {
  if (def === null || typeof def !== 'object') return undefined
  const rec = def as Record<string, unknown> & { deprecated?: unknown }
  if (typeof rec.deprecated === 'string' && rec.deprecated) return rec.deprecated
  return deprecationNote(rec['x-deprecated'])
}

/** Appends a `(deprecated...)` marker to help text, leaving it unchanged when absent. */
export function withDeprecatedMarker (text: string, note: string | undefined): string {
  if (note == null || note === '') return text
  return `${text} (deprecated: ${note})`
}
