/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripHtmlTags,
  newUuid,
  docsSearch,
  docsRead,
  resolveDocsPath,
  docsAskStream,
} from '../../src/docs/client.ts'

type FetchArgs = { url: string; init?: RequestInit }
type FetchHandler = (args: FetchArgs) => Response | Promise<Response>

const realFetch = globalThis.fetch

function installFetch (handler: FetchHandler): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler({ url, init })
  }) as typeof fetch
}

function restoreFetch (): void {
  globalThis.fetch = realFetch
}

function sseStream (chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start (controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

describe('docs client utilities', () => {
  describe('stripHtmlTags', () => {
    it('removes simple HTML tags', () => {
      assert.equal(stripHtmlTags('<mark>highlighted</mark> text'), 'highlighted text')
    })

    it('removes multiple tags', () => {
      assert.equal(stripHtmlTags('<b>bold</b> and <em>italic</em>'), 'bold and italic')
    })

    it('passes through plain text unchanged', () => {
      assert.equal(stripHtmlTags('no tags here'), 'no tags here')
    })

    it('handles empty string', () => {
      assert.equal(stripHtmlTags(''), '')
    })
  })

  describe('newUuid', () => {
    it('generates a UUID v4 formatted string', () => {
      const uuid = newUuid()
      assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('generates unique values', () => {
      const ids = new Set(Array.from({ length: 10 }, () => newUuid()))
      assert.equal(ids.size, 10)
    })
  })

  describe('docsSearch', () => {
    afterEach(restoreFetch)

    it('calls the search endpoint and returns the parsed body', async () => {
      const captured: FetchArgs[] = []
      installFetch(async (args) => {
        captured.push(args)
        return new Response(JSON.stringify({
          results: [],
          totalResults: 0,
          pageNumber: 1,
          pageSize: 5,
          pageCount: 0,
        }), { status: 200 })
      })

      const resp = await docsSearch('hello')
      assert.equal(resp.totalResults, 0)
      assert.equal(captured.length, 1)
      assert.ok(captured[0].url.includes('/_api/v1/search?'))
      assert.ok(captured[0].url.includes('q=hello'))
      assert.ok(captured[0].url.includes('page=1'))
      assert.ok(captured[0].url.includes('size=5'))
    })

    it('throws with status and body on non-ok response', async () => {
      installFetch(async () => new Response('upstream broken', { status: 503, statusText: 'Service Unavailable' }))
      await assert.rejects(
        docsSearch('x'),
        /docs search error \(503\): upstream broken/,
      )
    })

    it('falls back to statusText when body is empty', async () => {
      installFetch(async () => new Response('', { status: 500, statusText: 'Server Error' }))
      await assert.rejects(
        docsSearch('x'),
        /docs search error \(500\): Server Error/,
      )
    })

    it('swallows errors from text() and falls back to statusText', async () => {
      const fakeResponse = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => { throw new Error('stream read failed') },
      } as unknown as Response
      globalThis.fetch = (async () => fakeResponse) as typeof fetch
      await assert.rejects(
        docsSearch('x'),
        /docs search error \(502\): Bad Gateway/,
      )
    })
  })

  describe('docsRead', () => {
    afterEach(restoreFetch)

    it('appends .md to a /reference path and fetches elastic.co/docs', async () => {
      let seen = ''
      installFetch(async ({ url }) => {
        seen = url
        return new Response('# page', { status: 200 })
      })

      const body = await docsRead('/reference/elasticsearch')
      assert.equal(body, '# page')
      assert.equal(seen, 'https://www.elastic.co/docs/reference/elasticsearch.md')
    })

    it('handles paths already starting with /docs', async () => {
      let seen = ''
      installFetch(async ({ url }) => {
        seen = url
        return new Response('ok', { status: 200 })
      })
      await docsRead('/docs/reference/foo')
      assert.equal(seen, 'https://www.elastic.co/docs/reference/foo.md')
    })

    it('handles bare paths without leading slash', async () => {
      let seen = ''
      installFetch(async ({ url }) => {
        seen = url
        return new Response('ok', { status: 200 })
      })
      await docsRead('reference/foo')
      assert.equal(seen, 'https://www.elastic.co/docs/reference/foo.md')
    })

    it('strips an existing .md suffix before re-adding it', async () => {
      let seen = ''
      installFetch(async ({ url }) => {
        seen = url
        return new Response('ok', { status: 200 })
      })
      await docsRead('/reference/foo.md')
      assert.equal(seen, 'https://www.elastic.co/docs/reference/foo.md')
    })

    it('throws with the URL on non-ok response', async () => {
      installFetch(async () => new Response('', { status: 404 }))
      await assert.rejects(
        docsRead('/missing'),
        /docs read error \(404\) for https:\/\/www\.elastic\.co\/docs\/missing\.md/,
      )
    })
  })

  describe('resolveDocsPath', () => {
    afterEach(restoreFetch)

    it('strips https://www.elastic.co from a full docs URL', async () => {
      const path = await resolveDocsPath('https://www.elastic.co/docs/reference/foo')
      assert.equal(path, '/docs/reference/foo')
    })

    it('strips https://elastic.co from a bare elastic.co docs URL', async () => {
      const path = await resolveDocsPath('https://elastic.co/docs/reference/foo')
      assert.equal(path, '/docs/reference/foo')
    })

    it('returns an absolute path unchanged', async () => {
      const path = await resolveDocsPath('/reference/foo')
      assert.equal(path, '/reference/foo')
    })

    it('falls back to docsSearch for free-text input', async () => {
      installFetch(async () => new Response(JSON.stringify({
        results: [{
          type: 'page',
          url: '/reference/hit',
          title: 'hit',
          description: '',
          score: 1,
          navigationSection: '',
          lastUpdated: '',
        }],
        totalResults: 1,
        pageNumber: 1,
        pageSize: 1,
        pageCount: 1,
      }), { status: 200 }))

      const path = await resolveDocsPath('elasticsearch intro')
      assert.equal(path, '/reference/hit')
    })

    it('throws when search returns no results', async () => {
      installFetch(async () => new Response(JSON.stringify({
        results: [],
        totalResults: 0,
        pageNumber: 1,
        pageSize: 1,
        pageCount: 0,
      }), { status: 200 }))

      await assert.rejects(
        resolveDocsPath('nothing matches'),
        /no docs found for "nothing matches"/,
      )
    })
  })

  describe('docsAskStream', () => {
    afterEach(restoreFetch)

    it('throws with body on non-ok response', async () => {
      installFetch(async () => new Response('denied', { status: 403 }))
      const gen = docsAskStream('hi', 'cid')
      await assert.rejects(gen.next(), /docs ask error \(403\): denied/)
    })

    it('falls back to statusText when body is empty on failure', async () => {
      installFetch(async () => new Response('', { status: 500, statusText: 'Server Error' }))
      const gen = docsAskStream('hi', 'cid')
      await assert.rejects(gen.next(), /docs ask error \(500\): Server Error/)
    })

    it('throws when the response body is null', async () => {
      installFetch(async () => new Response(null, { status: 200 }))
      const gen = docsAskStream('hi', 'cid')
      await assert.rejects(gen.next(), /docs ask: response body is null/)
    })

    it('swallows errors from text() on non-ok response', async () => {
      const fakeResponse = {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => { throw new Error('stream read failed') },
      } as unknown as Response
      globalThis.fetch = (async () => fakeResponse) as typeof fetch
      const gen = docsAskStream('hi', 'cid')
      await assert.rejects(gen.next(), /docs ask error \(500\): Server Error/)
    })

    it('yields status events for search_tool_call and tool_result, then chunks, and stops on message_complete', async () => {
      const events = [
        'data: {"type":"search_tool_call","searchQuery":"foo"}\n\n',
        'data: {"type":"tool_result"}\n\n',
        'data: {"type":"message_chunk","content":"Hello"}\n\n',
        'data: {"type":"message_complete"}\n\n',
        'data: {"type":"message_chunk","content":"Ignored"}\n\n',
      ]
      installFetch(async () => new Response(sseStream(events), { status: 200 }))

      const out: Array<{ kind: string; text?: string; message?: string }> = []
      for await (const ev of docsAskStream('hi', 'cid')) {
        out.push(ev)
      }
      assert.deepEqual(out, [
        { kind: 'status', message: 'Searching: foo…' },
        { kind: 'status', message: 'Generating answer…' },
        { kind: 'chunk', text: 'Hello' },
      ])
    })

    it('stops on conversation_end event', async () => {
      const events = [
        'data: {"type":"message_chunk","content":"part"}\n\n',
        'data: {"type":"conversation_end"}\n\n',
      ]
      installFetch(async () => new Response(sseStream(events), { status: 200 }))
      const out: string[] = []
      for await (const ev of docsAskStream('hi', 'cid')) {
        if (ev.kind === 'chunk') out.push(ev.text)
      }
      assert.deepEqual(out, ['part'])
    })

    it('stops when event type is "done" even without matching data type', async () => {
      const events = [
        'event: done\ndata: {"type":"ignored"}\n\n',
      ]
      installFetch(async () => new Response(sseStream(events), { status: 200 }))
      const out: unknown[] = []
      for await (const ev of docsAskStream('hi', 'cid')) out.push(ev)
      assert.deepEqual(out, [])
    })

    it('ignores malformed JSON data events', async () => {
      const events = [
        'data: {not valid json}\n\n',
        'data: {"type":"message_chunk","content":"after"}\n\n',
        'data: {"type":"message_complete"}\n\n',
      ]
      installFetch(async () => new Response(sseStream(events), { status: 200 }))

      const out: string[] = []
      for await (const ev of docsAskStream('hi', 'cid')) {
        if (ev.kind === 'chunk') out.push(ev.text)
      }
      assert.deepEqual(out, ['after'])
    })

    it('handles data lines split across chunk boundaries', async () => {
      const events = [
        'data: {"type":"message_chu',
        'nk","content":"joined"}\n\n',
        'data: {"type":"message_complete"}\n\n',
      ]
      installFetch(async () => new Response(sseStream(events), { status: 200 }))

      const out: string[] = []
      for await (const ev of docsAskStream('hi', 'cid')) {
        if (ev.kind === 'chunk') out.push(ev.text)
      }
      assert.deepEqual(out, ['joined'])
    })
  })
})
