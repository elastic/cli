/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsClient } from '../../lib/es-client.ts'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../../factory.ts'
import { getEsClient } from '../../lib/es-client.ts'
import { missingConfigError, transportError } from '../errors.ts'
import { readRawInput } from './shared.ts'
import { encodeMultiTargetPathParam } from '../../lib/path-encoding.ts'

interface SearchHit {
  _source?: unknown
  _id?: string
}

interface SearchResponse {
  _scroll_id?: string
  hits?: {
    hits?: SearchHit[]
    total?: { value?: number } | number
  }
}

/** Dependencies injectable for testing. */
export interface ScrollSearchDeps {
  getEsClient: () => EsClient
  stdout: { write: (chunk: string) => boolean }
  stderr: { write: (chunk: string) => boolean }
  env?: NodeJS.ProcessEnv
}

const defaultDeps: ScrollSearchDeps = {
  getEsClient,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
}

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    index: { type: 'string', description: 'Target index' },
    query: { type: 'string', description: 'Query DSL clause as JSON (wrapped under "query"), e.g. \'{"match_all":{}}\'' },
    query_file: { type: 'string', description: 'Path to a file containing the full search body JSON (may include query, sort, aggs, ...)' },
    scroll: { type: 'string', description: 'Scroll keep-alive duration', default: '1m' },
    size: { type: 'integer', description: 'Documents per scroll batch', default: 1000 },
    max_docs: { type: 'integer', description: 'Maximum total documents to fetch (default: unlimited)' },
  },
  required: ['index'],
}

interface ScrollSearchInput {
  index: string
  query?: string
  query_file?: string
  scroll: string
  size: number
  max_docs?: number
}

function createScrollSearchHandler (deps: ScrollSearchDeps = defaultDeps) {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    const inp = parsed.input as ScrollSearchInput
    const { index, query, query_file, scroll, size, max_docs } = inp
    const maxDocs = max_docs ?? Infinity

    let transport: EsClient
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    // Build the search request body:
    //   --query      → a Query DSL clause, wrapped as { query: <parsed> }
    //   --query-file → a full search body (may contain query, sort, aggs, ...)
    let queryBody: Record<string, unknown> = {}
    try {
      if (query != null) {
        queryBody = { query: JSON.parse(query) as Record<string, unknown> }
      } else if (query_file != null) {
        const raw = readRawInput(query_file)
        if (raw != null && raw.trim().length > 0) {
          queryBody = JSON.parse(raw) as Record<string, unknown>
        }
      }
    } catch (err) {
      return { error: { code: 'input_error', message: `Failed to parse query: ${err instanceof Error ? err.message : String(err)}` } }
    }

    const jsonMode = parsed.options['json'] === true
    const documents: JsonValue[] = []
    const startTime = Date.now()
    let scrollId: string | undefined
    let totalDocs = 0

    if (jsonMode && maxDocs === Infinity && deps.env?.['ELASTIC_NO_WARN'] !== '1') {
      deps.stderr.write('Warning: --json buffers all documents in memory. Set --max-docs <n> to limit.\n')
    }

    try {
      // Initial search with scroll
      const encodedIndex = encodeMultiTargetPathParam(index)
      const initialResult = await transport.request<SearchResponse>({
        method: 'POST',
        path: `/${encodedIndex}/_search`,
        querystring: { scroll, size },
        body: queryBody
      })

      let scrollId2 = initialResult._scroll_id
      // Save initial scroll ID immediately for cleanup even if loop fails
      if (scrollId2 != null) scrollId = scrollId2
      let hits = initialResult.hits?.hits ?? []

      // Process pages
      while (hits.length > 0 && totalDocs < maxDocs) {
        for (const hit of hits) {
          if (totalDocs >= maxDocs) break
          if (jsonMode) {
            // _source is user-defined JSON — always a valid JsonValue at runtime
            documents.push(hit._source as JsonValue)
          } else {
            deps.stdout.write(JSON.stringify(hit._source) + '\n')
          }
          totalDocs++
        }

        if (totalDocs >= maxDocs || scrollId2 == null) break

        // Fetch next page
        const scrollResult = await transport.request<SearchResponse>({
          method: 'POST',
          path: '/_search/scroll',
          body: { scroll, scroll_id: scrollId2 }
        })

        scrollId2 = scrollResult._scroll_id
        scrollId = scrollId2
        hits = scrollResult.hits?.hits ?? []
      }
      scrollId = scrollId2
    } catch (err) {
      return transportError(err)
    } finally {
      // Always clean up the scroll context
      if (scrollId != null) {
        try {
          await transport.request({ method: 'DELETE', path: '/_search/scroll', body: { scroll_id: scrollId } })
        } catch { /* best-effort cleanup — scroll will expire naturally */ }
      }
    }

    const elapsed_ms = Date.now() - startTime
    deps.stderr.write(`Fetched ${totalDocs} documents in ${elapsed_ms}ms\n`)

    if (jsonMode) return { documents, total_docs: totalDocs, elapsed_ms }
    return { total_docs: totalDocs, elapsed_ms }
  }
}

export function createScrollSearchCommand (deps?: ScrollSearchDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'scroll-search',
    description: 'Scroll through all search results, streaming documents as NDJSON to stdout, or returning a single JSON object when --json is set.',
    input: inputSchema,
    handler: createScrollSearchHandler(deps),
    intent: { destructive: false, idempotent: true, scope: 'global' },
    formatOutput: () => ''
  })
}
