/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
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

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search terms' },
    page: { type: 'integer', description: 'Page number', default: 1 },
    size: { type: 'integer', description: 'Results per page', default: 5 },
  },
}

function experimentalBanner (command: string, isTTY: boolean): string {
  const text =
    `Warning: "${command}" is experimental and in active development.\n` +
    `         Not yet suited for scripts or automation. Pass --accept-experimental to suppress this warning.\n\n`
  return isTTY ? `\x1b[33m${text}\x1b[0m` : text
}

export function createSearchCommand (deps: SearchDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'search',
    description: 'Search Elastic documentation',
    input: inputSchema,
    positionalArg: { name: 'query', description: 'Search terms', required: false },
    options: [
      {
        long: 'accept-experimental',
        type: 'boolean',
        description: 'Acknowledge that this command is experimental and may be removed; suppresses the warning',
      },
    ],
    handler: async (parsed): Promise<JsonValue> => {
      if (parsed.options['accept-experimental'] !== true && parsed.options['json'] !== true) {
        deps.stderr.write(experimentalBanner('docs search', process.stderr.isTTY === true))
      }
      const inp = parsed.input as { query?: string; page?: number; size?: number } | undefined
      const query = (parsed.arg ?? inp?.query ?? '').trim()
      if (query === '') return { error: { code: 'missing_input', message: 'query is required' } }
      const page = inp?.page ?? 1
      const size = inp?.size ?? 5

      try {
        const resp = await deps.docsSearch(query, page, size)
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
      return renderMarkdown(md)
    }
  })
}
