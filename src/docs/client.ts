/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const DOCS_BASE_URL = 'https://www.elastic.co/docs'
const DOCS_COOKIE = 'feature_search_or_askai_enabled=true'

export interface DocsProduct {
  id: string
  displayName: string
}

export interface DocsSearchResult {
  type: string
  url: string
  title: string
  description: string
  aiShortSummary?: string
  score: number
  navigationSection: string
  lastUpdated: string
  product?: DocsProduct
  relatedProducts?: DocsProduct[]
}

export interface DocsSearchResponse {
  results: DocsSearchResult[]
  totalResults: number
  pageNumber: number
  pageSize: number
  pageCount: number
}

/**
 * Search the Elastic documentation.
 */
export async function docsSearch (query: string, page = 1, size = 5): Promise<DocsSearchResponse> {
  const params = new URLSearchParams({ q: query, page: String(page), size: String(size), sort: 'relevance' })
  const url = `${DOCS_BASE_URL}/_api/v1/search?${params.toString()}`

  const resp = await fetch(url, {
    headers: { Accept: 'application/json', Cookie: DOCS_COOKIE }
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`docs search error (${resp.status}): ${body.trim() || resp.statusText}`)
  }

  return resp.json() as Promise<DocsSearchResponse>
}

/**
 * Fetch a docs page as raw markdown.
 * Accepts a relative path (e.g. `/reference/elasticsearch`), a full elastic.co URL,
 * or a free-text query (performs a search and reads the first result).
 */
export async function docsRead (path: string): Promise<string> {
  // strip trailing .md if already present
  path = path.replace(/\.md$/, '')

  let url: string
  if (path.startsWith('/docs')) {
    url = `https://www.elastic.co${path}.md`
  } else if (path.startsWith('/')) {
    url = `${DOCS_BASE_URL}${path}.md`
  } else {
    url = `${DOCS_BASE_URL}/${path}.md`
  }

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`docs read error (${resp.status}) for ${url}`)
  }
  return resp.text()
}

/**
 * Resolve user input to a docs path suitable for `docsRead`.
 * Accepts a full elastic.co URL, a /path, or a free-text query.
 */
export async function resolveDocsPath (input: string): Promise<string> {
  if (input.startsWith('https://www.elastic.co/docs')) {
    return input.replace('https://www.elastic.co', '')
  }
  if (input.startsWith('https://elastic.co/docs')) {
    return input.replace('https://elastic.co', '')
  }
  if (input.startsWith('/')) {
    return input
  }
  // free-text: search and return the first result's URL
  const resp = await docsSearch(input, 1, 1)
  if (resp.results.length === 0) {
    throw new Error(`no docs found for "${input}"`)
  }
  return resp.results[0]!.url
}

/**
 * Discriminated union emitted by {@link docsAskStream}.
 * - `status` events carry a human-readable phase label for the spinner.
 * - `chunk` events carry a fragment of the AI response text.
 */
export type AskStreamEvent =
  | { kind: 'status'; message: string }
  | { kind: 'chunk'; text: string }

/**
 * Stream an AI answer from the Elastic docs ask endpoint.
 * Yields {@link AskStreamEvent} values: `status` events during the thinking
 * phase and `chunk` events once text generation begins.
 * Stops after the message_complete or conversation_end event.
 * The caller is responsible for generating a unique conversationId.
 */
export async function* docsAskStream (message: string, conversationId: string): AsyncGenerator<AskStreamEvent> {
  const resp = await fetch(`${DOCS_BASE_URL}/_api/v1/ask-ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Cookie: DOCS_COOKIE,
    },
    body: JSON.stringify({ message, conversationId }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`docs ask error (${resp.status}): ${body.trim() || resp.statusText}`)
  }

  if (resp.body == null) {
    throw new Error('docs ask: response body is null')
  }

  const decoder = new TextDecoder()
  let eventType = ''
  let dataLines: string[] = []
  // Buffer for incomplete lines: HTTP body chunks can split anywhere, including
  // in the middle of a `data:` line. Without this, the two halves of a split
  // line are each pushed to dataLines separately, making dataLines.join('\n')
  // produce invalid JSON that silently drops the event and its content.
  let lineBuf = ''

  for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) {
    lineBuf += decoder.decode(chunk, { stream: true })
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? '' // keep the last (possibly incomplete) line for next chunk

    for (const line of lines) {
      if (line === '') {
        // blank line = dispatch event
        if (dataLines.length > 0) {
          const data = dataLines.join('\n')
          dataLines = []
          const type = eventType
          eventType = ''

          try {
            const payload = JSON.parse(data) as Record<string, unknown>
            if (payload.type === 'search_tool_call' && typeof payload.searchQuery === 'string') {
              yield { kind: 'status', message: `Searching: ${payload.searchQuery}…` }
            } else if (payload.type === 'tool_result') {
              yield { kind: 'status', message: 'Generating answer…' }
            } else if (payload.type === 'message_chunk' && typeof payload.content === 'string') {
              yield { kind: 'chunk', text: payload.content }
            } else if (payload.type === 'message_complete' || payload.type === 'conversation_end' || type === 'done') {
              return
            }
          } catch {
            // ignore malformed JSON
          }
        }
        continue
      }

      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim())
      }
    }
  }
}

/**
 * Strip simple HTML tags (e.g. `<mark>`) from a string.
 */
export function stripHtmlTags (s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

/**
 * Generate a UUID v4.
 */
export function newUuid (): string {
  return crypto.randomUUID()
}
