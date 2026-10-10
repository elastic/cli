/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import Table from 'cli-table3'
import type { JsonValue } from './factory.ts'

/** Next-command hint after 401/403. JSON errors put this in `error.hint`. */
export const AUTH_FAILURE_HINT =
  'Run `elastic status --json` to see which service failed, then `elastic config context edit`.'

/** A flat object whose values are all JSON primitives — renderable as a table row. */
type FlatRecord = Record<string, string | number | boolean | null>

/** Strips ANSI SGR escape sequences. Exported for tests guarding the no-ANSI contract. */
export function stripAnsi (value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001B\[[\d;]*m/g, '')
}

/**
 * Returns true when ANSI colors may be emitted for the given TTY state.
 *
 * `NO_COLOR` (set to any value) always wins. `FORCE_COLOR` (set to anything
 * except `'0'`) forces colors on, otherwise colors follow the TTY state.
 * Mirrors the banner logic in `src/lib/logo.ts`.
 */
export function colorsEnabled (isTTY: boolean): boolean {
  if (process.env.NO_COLOR !== undefined) return false
  const force = process.env.FORCE_COLOR
  if (force !== undefined && force !== '0') return true
  return isTTY
}

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
 * Collects the union of keys across all rows in first-seen order.
 *
 * Later rows may introduce keys the first row lacks (e.g.
 * `[{a:1},{a:2,b:3}]` must render both `a` and `b` columns), so headers
 * cannot be derived from the first row alone.
 */
function collectHeaders (rows: FlatRecord[]): string[] {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  return headers
}

/**
 * Renders an array of flat objects as a Unicode-bordered table using cli-table3.
 *
 * Column headers are the union of keys across all rows, in first-seen order.
 * Each subsequent row is added in the same key order; cells missing from a
 * row render as empty strings. Returns an empty string for an empty array.
 *
 * @example
 * ```ts
 * renderTable([{ name: 'foo', count: 3 }, { name: 'bar', count: 12 }])
 * // ┌──────┬───────┐
 * // │ name │ count │
 * // ├──────┼───────┤
 * // │ foo  │ 3     │
 * // ├──────┼───────┤
 * // │ bar  │ 12    │
 * // └──────┴───────┘
 * ```
 */
export function renderTable(rows: FlatRecord[]): string {
  if (rows.length === 0) return ''

  const headers = collectHeaders(rows)
  const table = new Table({ head: headers })

  for (const row of rows) {
    table.push(headers.map((h) => String(row[h] ?? '')))
  }

  const text = table.toString() + '\n'
  return colorsEnabled(process.stdout.isTTY === true) ? text : stripAnsi(text)
}

/**
 * Renders an array of flat objects as tab-separated values.
 *
 * Used when stdout is not a TTY and `--json` is absent: no Unicode borders,
 * one header line followed by one line per row. Tabs, newlines, and carriage
 * returns inside cells are replaced with spaces so every row stays parseable.
 * Headers are the union of keys across all rows, in first-seen order; cells
 * missing from a row render as empty strings.
 */
export function renderTsv (rows: FlatRecord[]): string {
  if (rows.length === 0) return ''
  const sanitize = (v: string | number | boolean | null): string =>
    String(v ?? '').replace(/[\t\n\r]+/g, ' ')
  const headers = collectHeaders(rows)
  const lines = [headers.map(sanitize).join('\t')]
  for (const row of rows) {
    lines.push(headers.map((h) => sanitize(row[h] ?? null)).join('\t'))
  }
  return lines.join('\n') + '\n'
}

/** Print a text-default API body. Empty CAT and other non-string bodies print nothing. */
export function formatTextResponse (result: unknown): string {
  if (typeof result !== 'string' || result.length === 0) return ''
  return result.endsWith('\n') ? result : `${result}\n`
}

/**
 * Auto-renders a `JsonValue` as human-readable terminal text.
 *
 * Rendering rules (simplest match wins):
 * - **Primitives** (`string | number | boolean | null`): printed as their string representation
 * - **Array of flat objects** (all values are primitives): rendered as a column-aligned table via {@link renderTable}, or as TSV via {@link renderTsv} when `opts.plain` is set (piped output)
 * - **Array of primitives**: one item per line
 * - **Empty array**: single newline
 * - **Everything else**: falls back to pretty-printed JSON
 *
 * Command handlers that need richer control should supply a `formatOutput` function
 * on their `CommandConfig` rather than relying on this auto-renderer.
 */
export function renderText(value: JsonValue, opts?: { plain?: boolean }): string {
  if (isPrimitive(value)) {
    return String(value) + '\n'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '\n'

    if (value.every(isFlatObject)) {
      return opts?.plain === true ? renderTsv(value) : renderTable(value)
    }

    if (value.every(isPrimitive)) {
      return value.map((v) => String(v)).join('\n') + '\n'
    }
  }

  if (isFlatObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v ?? ''}`)
      .join('\n') + '\n'
  }

  return JSON.stringify(value, null, 2) + '\n'
}

/**
 * Extracts a concise human-readable message from a handler error payload.
 *
 * Assumes `isHandlerError(value)` is `true`. Extraction rules (first match wins):
 *
 * - **`transport_error` with ES body** (`body.error.type` + `body.error.reason`):
 *   `"index_not_found_exception: no such index [foo]"`
 * - **`transport_error` with string body error** (`body.error` is a string):
 *   that string
 * - **`transport_error` with `status_code`** (no parseable body):
 *   `"request failed with status 404"`
 * - **Any error with `message`** (`missing_config`, `cloud_api_error`, generic):
 *   that message
 * - **Fallback**: `"unknown error (code: <code>)"`
 */
function withHint (message: string, err: Record<string, JsonValue>): string {
  return typeof err.hint === 'string' ? `${message}\n${err.hint}` : message
}

export function formatHandlerError (value: JsonValue): string {
  const err = (value as Record<string, JsonValue>).error as Record<string, JsonValue>
  const code = err.code as string

  if (code === 'transport_error' || code === 'auth_required' || code === 'not_found') {
    const body = err.body
    if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
      const nested = (body as Record<string, JsonValue>).error
      if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
        const t = (nested as Record<string, JsonValue>).type
        const r = (nested as Record<string, JsonValue>).reason
        if (typeof t === 'string' && typeof r === 'string') return withHint(`${t}: ${r}`, err)
      }
      if (typeof nested === 'string') return withHint(nested, err)
    }
    if (typeof err.status_code === 'number') return withHint(`request failed with status ${err.status_code}`, err)
  }

  if (typeof err.message === 'string') return withHint(err.message, err)
  return withHint(`unknown error (code: ${code})`, err)
}
