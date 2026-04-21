/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from '@elastic/transport'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../../factory.ts'
import { getTransport } from '../../lib/transport.ts'
import { missingConfigError, transportError } from '../errors.ts'
import { readRawInput } from './shared.ts'

interface ScrollSearchOptions {
  index: string
  query?: string | undefined
  'input-file'?: string | undefined
  scroll: string
  size: number
  'max-docs': number
}

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
  getTransport: () => Transport
  stdout: { write: (chunk: string) => boolean }
  stderr: { write: (chunk: string) => boolean }
}

const defaultDeps: ScrollSearchDeps = {
  getTransport,
  stdout: process.stdout,
  stderr: process.stderr
}

function createScrollSearchHandler (deps: ScrollSearchDeps = defaultDeps) {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    const opts = parsed.options as unknown as ScrollSearchOptions

    let transport: Transport
    try {
      transport = deps.getTransport()
    } catch (err) {
      return missingConfigError(err)
    }

    // Parse query body from --query flag, --input-file, or stdin (in that priority order)
    let queryBody: Record<string, unknown> = {}
    try {
      if (opts.query != null) {
        queryBody = JSON.parse(opts.query) as Record<string, unknown>
      } else if (opts['input-file'] != null) {
        const raw = readRawInput(opts['input-file'])
        if (raw != null && raw.trim().length > 0) {
          queryBody = JSON.parse(raw) as Record<string, unknown>
        }
      } else if (!process.stdin.isTTY) {
        const raw = readRawInput()
        if (raw != null && raw.trim().length > 0) {
          queryBody = JSON.parse(raw) as Record<string, unknown>
        }
      }
    } catch (err) {
      return {
        error: {
          code: 'input_error',
          message: `Failed to parse query: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    const jsonMode = parsed.options['json'] === true
    const documents: JsonValue[] = []
    const startTime = Date.now()
    let scrollId: string | undefined
    let totalDocs = 0
    const maxDocs = opts['max-docs']

    try {
      // Initial search with scroll
      const index = encodeURIComponent(opts.index)
      const initialResult = await transport.request<SearchResponse>(
        {
          method: 'POST',
          path: `/${index}/_search`,
          querystring: { scroll: opts.scroll, size: opts.size },
          body: queryBody
        }
      )

      scrollId = initialResult._scroll_id
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

        if (totalDocs >= maxDocs || scrollId == null) break

        // Fetch next page
        const scrollResult = await transport.request<SearchResponse>({
          method: 'POST',
          path: '/_search/scroll',
          body: { scroll: opts.scroll, scroll_id: scrollId }
        })

        scrollId = scrollResult._scroll_id
        hits = scrollResult.hits?.hits ?? []
      }
    } catch (err) {
      return transportError(err)
    } finally {
      // Always clean up the scroll context
      if (scrollId != null) {
        try {
          await transport.request({
            method: 'DELETE',
            path: '/_search/scroll',
            body: { scroll_id: scrollId }
          })
        } catch {
          // Best-effort cleanup — scroll will expire naturally
        }
      }
    }

    const elapsed_ms = Date.now() - startTime
    deps.stderr.write(`Fetched ${totalDocs} documents in ${elapsed_ms}ms\n`)

    if (jsonMode) {
      return { documents, total_docs: totalDocs, elapsed_ms }
    }
    return { total_docs: totalDocs, elapsed_ms }
  }
}

export function createScrollSearchCommand (deps?: ScrollSearchDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'scroll-search',
    description: 'Scroll through all search results, streaming documents as NDJSON to stdout, or returning a single JSON object when --json is set.',
    options: [
      { long: 'index', short: 'i', description: 'Target index', type: 'string', required: true },
      { long: 'query', short: 'q', description: 'Search query body as JSON string', type: 'string' },
      { long: 'input-file', description: 'Path to file containing search body JSON', type: 'string' },
      { long: 'scroll', description: 'Scroll keep-alive duration', type: 'string', defaultValue: '1m' },
      { long: 'size', description: 'Documents per scroll batch', type: 'number', defaultValue: 1000 },
      { long: 'max-docs', description: 'Maximum total documents to fetch (default: unlimited)', type: 'number', defaultValue: Infinity },
    ],
    handler: createScrollSearchHandler(deps),
    formatOutput: () => ''
  })
}
