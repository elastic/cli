/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from '../factory.ts'

/**
 * Picks the specified fields from a JSON value, supporting dot-notation for nested access.
 *
 * - For objects: returns a new object with only the selected fields
 * - For arrays of objects: picks fields from each element
 * - For primitives/non-objects: returns the value unchanged (nothing to pick from)
 *
 * Dot-notation (e.g. `"hits.total"`) descends into nested objects.
 * Missing fields are silently omitted.
 */
export function pickFields (value: JsonValue, fields: string[]): JsonValue {
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map((item) => pickFields(item, fields))
  }

  const result: Record<string, JsonValue> = {}
  for (const field of fields) {
    // If the source has the literal dotted key (cat API style), preserve it
    // verbatim in the result; otherwise descend the path nestedly.
    if (Object.prototype.hasOwnProperty.call(value, field) && value[field] !== undefined) {
      result[field] = value[field]
      continue
    }
    const val = getNestedValue(value, field)
    if (val !== undefined) {
      setNestedValue(result, field, val)
    }
  }
  return result
}

function getNestedValue (obj: JsonValue, path: string): JsonValue | undefined {
  if (obj === null || typeof obj !== 'object') return undefined
  
  // Literal-key fast path: cat APIs and similar return flat objects whose keys
  // contain literal dots (e.g. "docs.count"). Prefer a literal match over splitting,
  // so a literal key wins over an equivalent nested path when both exist.
  if (!Array.isArray(obj) && obj[path] !== undefined) return obj[path]
  
  if (Array.isArray(obj)) {
    return obj
      .map((el) => getNestedValue(el, path))
      .filter((v): v is JsonValue => v !== undefined)
  }
  const dot = path.indexOf('.')
  if (dot === -1) {
    return (obj as Record<string, JsonValue>)[path]
  }
  const head = path.slice(0, dot)
  const rest = path.slice(dot + 1)
  const next = (obj as Record<string, JsonValue>)[head]
  if (next === undefined) return undefined
  return getNestedValue(next, rest)
}

function setNestedValue (obj: Record<string, JsonValue>, path: string, value: JsonValue): void {
  const parts = path.split('.')
  let current: Record<string, JsonValue> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (current[part] === undefined || typeof current[part] !== 'object' || current[part] === null || Array.isArray(current[part])) {
      current[part] = {}
    }
    current = current[part] as Record<string, JsonValue>
  }
  current[parts[parts.length - 1]!] = value
}

/**
 * Parses a comma-separated field list into individual field names.
 * Trims whitespace from each field and drops empties.
 */
export function parseFieldList (raw: string): string[] {
  return raw.split(',').map((f) => f.trim()).filter((f) => f.length > 0)
}

/**
 * Renders a value using a Mustache-like template string.
 *
 * Supported syntax:
 * - `{{field}}` — replaced with the field value (dot-notation supported)
 * - `{{field}}` on missing fields — replaced with empty string
 *
 * For arrays: renders one line per element.
 * For primitives: returns the template with `{{.}}` replaced by the value.
 */
export function applyTemplate (value: JsonValue, template: string): string {
  if (value === null || typeof value !== 'object') {
    return template.replace(/\{\{\s*\.?\s*\}\}/g, String(value)) + '\n'
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, template)).join('')
  }

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, field: string) => {
    if (field === '.') return JSON.stringify(value)
    const val = getNestedValue(value, field)
    if (val === undefined || val === null) return ''
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  }) + '\n'
}
