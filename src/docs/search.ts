/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
import { docsSearch, stripHtmlTags } from './client.ts'
import { ACCEPT_EXPERIMENTAL_OPTION, warnIfExperimental } from '../lib/experimental.ts'

function resultSummary (aiShortSummary: string | undefined, description: string): string {
  return (aiShortSummary != null && aiShortSummary !== '') ? aiShortSummary : stripHtmlTags(description)
}

export interface SearchDeps {
  docsSearch: typeof docsSearch
  stderr: { write: (chunk: string) => boolean }
}

const defaultDeps: SearchDeps = { docsSearch, stderr: process.stderr }

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search terms' },
    page: { type: 'integer', description: 'Page number', default: 1 },
    size: { type: 'integer', description: 'Results per page', default: 5 },
  },
}

export function createSearchCommand (deps: SearchDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'search',
    description: 'Search Elastic documentation',
    input: inputSchema,
    positionalArg: { name: 'query', description: 'Search terms', required: false },
    options: [ACCEPT_EXPERIMENTAL_OPTION],
    handler: async (parsed): Promise<JsonValue> => {
      warnIfExperimental(parsed, {
        label: 'docs search',
        status: 'in active development',
        advice: 'Not yet suited for scripts or automation.',
      }, deps.stderr)
      const inp = parsed.input as { query?: string; page?: number; size?: number } | undefined
      const query = (parsed.arg ?? inp?.query ?? '').trim()
      if (query === '') return { error: { code: 'missing_input', message: 'query is required' } }
      const page = inp?.page ?? 1
      const size = inp?.size ?? 5

      try {
        const resp = await deps.docsSearch(query, page, size)
        // Return structured data for --json; formatOutput handles text rendering
        return {
          results: resp.results.map((r) => ({
            title: stripHtmlTags(r.title),
            url: `https://www.elastic.co${r.url}`,
            description: resultSummary(r.aiShortSummary, r.description),
            product: r.product?.displayName ?? null,
          })),
          total: resp.totalResults,
          page: resp.pageNumber,
          pageCount: resp.pageCount,
        }
      } catch (err) {
        return {
          error: {
            code: 'docs_error',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
    formatOutput: async (result: JsonValue): Promise<string> => {
      if (
        typeof result === 'object' && result !== null && !Array.isArray(result) &&
        'error' in result
      ) {
        return ''
      }
      const data = result as { results: Array<{ title: string; url: string; description: string; product: string | null }>; total: number; page: number; pageCount: number }

      if (data.results.length === 0) return 'No results found.\n'

      let md = ''
      for (let i = 0; i < data.results.length; i++) {
        const r = data.results[i]!
        const summary = r.description.length > 250 ? r.description.slice(0, 250).trimEnd() + '…' : r.description
        md += `# ${r.title}\n`
        if (r.product != null && r.product !== '') md += `### ${r.product}\n`
        md += `${r.url}\n\n`
        md += `${summary}\n`
        if (i < data.results.length - 1) md += '\n---\n\n'
      }

      md += `\nPage ${data.page} of ${data.pageCount} (${data.total} results)\n`
      const { renderMarkdown } = await import('./renderer.ts')
      return renderMarkdown(md)
    }
  })
}
