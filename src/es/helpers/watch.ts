/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsClient } from '../../lib/es-client.ts'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getEsClient } from '../../lib/es-client.ts'
import { missingConfigError, transportError } from '../errors.ts'
import { readRawInput } from './shared.ts'

interface SearchHit {
  _source?: Record<string, unknown>
  _id?: string
  sort?: unknown[]
}

interface SearchResponse {
  hits?: {
    hits?: SearchHit[]
  }
}

/** Dependencies injectable for testing. */
export interface WatchDeps {
  getEsClient: () => EsClient
  stdout: { write: (chunk: string) => boolean }
  stderr: { write: (chunk: string) => boolean }
  sleep: (ms: number) => Promise<void>
  onSignal: (signal: string, handler: () => void) => void
  offSignal: (signal: string, handler: () => void) => void
}

const defaultDeps: WatchDeps = {
  getEsClient,
  stdout: process.stdout,
  stderr: process.stderr,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onSignal: (signal, handler) => process.on(signal, handler),
  offSignal: (signal, handler) => process.off(signal, handler),
}

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    index: { type: 'string', description: 'Index or data stream to watch' },
    query: { type: 'string', description: "Query DSL clause as JSON (wrapped under \"query\"), e.g. '{\"match\":{\"log.level\":\"error\"}}'" },
    query_file: { type: 'string', description: 'Path to a file containing the full search body JSON' },
    sort_field: { type: 'string', description: 'Field to use for ordering and detecting new documents', default: '@timestamp' },
    poll_interval: { type: 'integer', description: 'Polling interval in milliseconds', default: 5000 },
    from: { type: 'string', description: 'ISO 8601 timestamp to start from (e.g. "2024-01-01T00:00:00Z"). Defaults to the most recent document.' },
    size: { type: 'integer', description: 'Maximum documents to fetch per poll', default: 100 },
    format: { type: 'string', description: 'Output template with {field} placeholders, e.g. "{@timestamp} {message}". Omit for NDJSON (_source as JSON).' },
  },
  required: ['index'],
}

interface WatchInput {
  index: string
  query?: string
  query_file?: string
  sort_field: string
  poll_interval: number
  from?: string
  size: number
  format?: string
}

/** Resolves a dotted field path against an object, e.g. "log.level" → obj.log.level. */
function getNestedField (obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur != null && typeof cur === 'object' && !Array.isArray(cur)) {
      return (cur as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/** Render a `{field}` template against a document's _source. */
export function applyTemplate (template: string, source: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const val = getNestedField(source, path.trim())
    return val != null ? String(val) : `{${path}}`
  })
}

/**
 * Builds the search body for a watch poll.
 *
 * On the very first request (no searchAfter cursor yet) and when `--from` was given,
 * a range filter is added so we skip documents older than the anchor timestamp.
 * Once we have a cursor the sort+search_after mechanism prevents duplicates on its own.
 */
function buildSearchBody (
  baseQueryBody: Record<string, unknown>,
  sortField: string,
  size: number,
  searchAfter: unknown[] | undefined,
  fromTimestamp: string | undefined,
): Record<string, unknown> {
  let queryClause: Record<string, unknown>

  if (searchAfter == null && fromTimestamp != null) {
    // Initial request with a --from anchor: wrap with a range filter.
    const rangeFilter = { range: { [sortField]: { gt: fromTimestamp } } }
    const existingQuery = baseQueryBody.query
    if (existingQuery != null) {
      queryClause = { query: { bool: { must: existingQuery, filter: rangeFilter } } }
    } else {
      queryClause = { query: rangeFilter }
    }
  } else {
    queryClause = baseQueryBody.query != null ? { query: baseQueryBody.query } : {}
  }

  const body: Record<string, unknown> = {
    ...baseQueryBody,
    ...queryClause,
    sort: [{ [sortField]: 'asc' }, { _id: 'asc' }],
    size,
  }

  if (searchAfter != null) body.search_after = searchAfter

  return body
}

function createWatchHandler (deps: WatchDeps = defaultDeps) {
  return async (parsed: import("../../factory.ts").ParsedResult): Promise<JsonValue> => {
    const { index, query, query_file, sort_field, poll_interval, from, size, format } = (parsed.input as WatchInput)

    let transport: EsClient
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    // Parse the base query body.
    let baseQueryBody: Record<string, unknown> = {}
    try {
      if (query != null) {
        baseQueryBody = { query: JSON.parse(query) as Record<string, unknown> }
      } else if (query_file != null) {
        const raw = readRawInput(query_file)
        if (raw != null && raw.trim().length > 0) {
          baseQueryBody = JSON.parse(raw) as Record<string, unknown>
        }
      }
    } catch (err) {
      return { error: { code: 'input_error', message: `Failed to parse query: ${err instanceof Error ? err.message : String(err)}` } }
    }

    const encodedIndex = encodeURIComponent(index)
    // Determine the starting cursor.
    //   --from <ts>  → range-filter on the first request, then switch to search_after.
    //   (default)    → find the most recent document and use its sort values as the cursor.
    let searchAfter: unknown[] | undefined
    let fromTimestamp: string | undefined

    if (from != null) {
      fromTimestamp = from
      deps.stderr.write(`Watching ${index} from ${from}. Polling every ${poll_interval}ms...\n`)
    } else {
      // Anchor to the most recent document so we only see documents created after now.
      try {
        const anchorResult = await transport.request<SearchResponse>({
          method: 'POST',
          path: `/${encodedIndex}/_search`,
          body: { ...baseQueryBody, sort: [{ [sort_field]: 'desc' }, { _id: 'desc' }], size: 1 },
        })
        const lastHit = anchorResult.hits?.hits?.[0]
        if (lastHit?.sort != null) {
          searchAfter = lastHit.sort
          deps.stderr.write(`Watching ${index} from the most recent document. Polling every ${poll_interval}ms...\n`)
        } else {
          deps.stderr.write(`Watching ${index} from now (index is empty). Polling every ${poll_interval}ms...\n`)
        }
      } catch (err) {
        return transportError(err)
      }
    }

    deps.stderr.write('Press Ctrl+C to stop.\n')

    let running = true
    let totalDocs = 0
    const startTime = Date.now()

    const stopHandler = () => { running = false }
    deps.onSignal('SIGINT', stopHandler)

    try {
      while (running) {
        try {
          const body = buildSearchBody(baseQueryBody, sort_field, size, searchAfter, fromTimestamp)
          const result = await transport.request<SearchResponse>({ method: 'POST', path: `/${encodedIndex}/_search`, body })
          const hits = result.hits?.hits ?? []

          for (const hit of hits) {
            if (!running) break
            const source = (hit._source ?? {}) as Record<string, unknown>
            if (format != null) {
              deps.stdout.write(applyTemplate(format, source) + '\n')
            } else {
              deps.stdout.write(JSON.stringify(source) + '\n')
            }
            totalDocs++
          }

          // Advance the cursor to the last returned document.
          const lastHit = hits[hits.length - 1]
          if (lastHit?.sort != null) {
            searchAfter = lastHit.sort
            fromTimestamp = undefined // cursor takes over; range filter no longer needed
          }

          // If we got a full page there may be more waiting — skip the sleep and poll again.
          if (running && hits.length < size) await deps.sleep(poll_interval)
        } catch (err) {
          if (!running) break
          deps.stderr.write(`Poll error: ${err instanceof Error ? err.message : String(err)}\n`)
          await deps.sleep(poll_interval)
        }
      }
    } finally {
      deps.offSignal('SIGINT', stopHandler)
    }

    const elapsed_ms = Date.now() - startTime
    deps.stderr.write(`\nStreamed ${totalDocs} documents from ${index} in ${Math.round(elapsed_ms / 1000)}s.\n`)
    return { total_docs: totalDocs, elapsed_ms }
  }
}

export function createWatchCommand (deps?: WatchDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'watch',
    description: 'Watch an index for new documents and stream them to stdout as NDJSON.',
    input: inputSchema,
    handler: createWatchHandler(deps),
    intent: { destructive: false, idempotent: true, scope: 'global' },
    formatOutput: () => '',
  })
}
