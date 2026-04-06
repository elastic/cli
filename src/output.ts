/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonValue } from './factory.ts'

/** A flat object whose values are all JSON primitives — renderable as a table row. */
type FlatRecord = Record<string, string | number | boolean | null>

/** Returns true when `val` is a non-null, non-array object with only primitive values. */
function isFlatObject(val: JsonValue): val is FlatRecord {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false
  return Object.values(val).every((v) => v === null || typeof v !== 'object')
}

/** Returns true when `val` is a JSON primitive (string, number, boolean, or null). */
function isPrimitive(val: JsonValue): val is string | number | boolean | null {
  return val === null || typeof val !== 'object'
}

/**
 * Renders an array of flat objects as a plain-text column-aligned table.
 *
 * Column widths are the maximum of the header length and the widest cell value.
 * Columns are separated by two spaces. Trailing whitespace is trimmed from each line.
 * Returns an empty string for an empty array.
 *
 * @example
 * ```ts
 * renderTable([{ name: 'foo', count: 3 }, { name: 'bar', count: 12 }])
 * // name  count
 * // ----  -----
 * // foo   3
 * // bar   12
 * ```
 */
export function renderTable(rows: FlatRecord[]): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0]!)
  const colWidths = headers.map((h) => {
    const maxVal = Math.max(...rows.map((r) => String(r[h] ?? '').length))
    return Math.max(h.length, maxVal)
  })

  const formatRow = (cells: string[]): string =>
    cells.map((cell, i) => cell.padEnd(colWidths[i]!)).join('  ').trimEnd()

  const headerRow = formatRow(headers)
  const separator = colWidths.map((w) => '-'.repeat(w)).join('  ').trimEnd()
  const dataRows = rows.map((row) =>
    formatRow(headers.map((h) => String(row[h] ?? '')))
  )

  return [headerRow, separator, ...dataRows].join('\n') + '\n'
}

/**
 * Auto-renders a `JsonValue` as human-readable terminal text.
 *
 * Rendering rules (simplest match wins):
 * - **Primitives** (`string | number | boolean | null`): printed as their string representation
 * - **Array of flat objects** (all values are primitives): rendered as a column-aligned table via {@link renderTable}
 * - **Array of primitives**: one item per line
 * - **Empty array**: single newline
 * - **Everything else**: falls back to pretty-printed JSON
 *
 * Command handlers that need richer control should supply a `formatOutput` function
 * on their `CommandConfig` rather than relying on this auto-renderer.
 */
export function renderText(value: JsonValue): string {
  if (isPrimitive(value)) {
    return String(value) + '\n'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '\n'

    if (value.every(isFlatObject)) {
      return renderTable(value)
    }

    if (value.every(isPrimitive)) {
      return value.map((v) => String(v)).join('\n') + '\n'
    }
  }

  return JSON.stringify(value, null, 2) + '\n'
}
