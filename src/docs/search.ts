/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../factory.ts'
import { docsSearch, stripHtmlTags } from './client.ts'
import { renderMarkdown } from './renderer.ts'

function resultSummary (aiShortSummary: string | undefined, description: string): string {
  return (aiShortSummary != null && aiShortSummary !== '') ? aiShortSummary : stripHtmlTags(description)
}

export interface SearchDeps {
  docsSearch: typeof docsSearch
  stderr: { write: (chunk: string) => boolean }
}

const defaultDeps: SearchDeps = { docsSearch, stderr: process.stderr }

export function createSearchCommand (deps: SearchDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'search',
    description: 'Search Elastic documentation',
    positionalArg: { name: 'query', description: 'Search terms', required: true },
    options: [
      { long: 'page', type: 'number', description: 'Page number', defaultValue: 1 },
      { long: 'size', type: 'number', description: 'Results per page', defaultValue: 5 },
    ],
    handler: async (parsed: ParsedResult): Promise<JsonValue> => {
      const query = parsed.arg ?? ''
      const page = parsed.options['page'] as number
      const size = parsed.options['size'] as number

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
    formatOutput: (result: JsonValue): string => {
      if (
        typeof result === 'object' && result !== null && !Array.isArray(result) &&
        'error' in result
      ) {
        return ''
      }
      const data = result as { results: Array<{ title: string; url: string; description: string; product: string | null }>; total: number; page: number; pageCount: number }

      if (data.results.length === 0) {
        return 'No results found.\n'
      }

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

      deps.stderr.write(`Showing ${data.results.length} of ${data.total} results (page ${data.page} of ${data.pageCount})\n`)
      return renderMarkdown(md) + '\n'
    },
  })
}
