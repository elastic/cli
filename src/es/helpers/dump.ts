/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { closeSync, openSync, writeSync } from 'node:fs'
import type { EsClient } from '../../lib/es-client.ts'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getEsClient } from '../../lib/es-client.ts'
import { missingConfigError, transportError } from '../errors.ts'
import { readRawInput } from './shared.ts'

/** Dependencies injectable for testing. */
export interface DumpDeps {
  getEsClient: () => EsClient
  stdout: { write: (chunk: string) => boolean }
  stderr: { write: (chunk: string) => boolean }
}

const defaultDeps: DumpDeps = {
  getEsClient,
  stdout: process.stdout,
  stderr: process.stderr,
}

const inputSchema = z.object({
  indices: z.string().describe('Comma-separated list of indices to dump'),
  size: z.number().default(500).describe('Documents per search batch'),
  keep_alive: z.string().default('1m').describe('Point-in-time keep-alive duration'),
  output: z.string().optional().describe('Path to write bulk-format NDJSON; omit to stream to stdout'),
  skip_index_name: z.boolean().optional().describe('Omit _index from action lines so the dump can be re-targeted at a different index'),
  add_id: z.boolean().optional().describe('Include _id in action lines so document IDs round-trip'),
  query: z.string().optional().describe('Query DSL clause as a JSON string, e.g. \'{"term":{"status":"active"}}\''),
  query_file: z.string().optional().describe('Path to a file containing a Query DSL clause (use - for stdin)'),
})

type DumpInput = z.infer<typeof inputSchema>

interface Hit {
  _id: string
  _source: unknown
  sort?: unknown[]
}

interface SearchResponse {
  pit_id?: string
  hits?: { hits?: Hit[] }
}

interface PitResponse {
  id?: string
}

function resolveQuery (input: DumpInput): unknown {
  if (input.query != null) {
    return JSON.parse(input.query)
  }
  if (input.query_file != null) {
    // `-` is the conventional shorthand for "read from stdin"; readRawInput()
    // with no argument falls back to stdin.
    const raw = input.query_file === '-' ? readRawInput() : readRawInput(input.query_file)
    if (raw == null || raw.trim().length === 0) {
      throw new Error('--query-file is empty')
    }
    return JSON.parse(raw)
  }
  return { match_all: {} }
}

/** Mutable handle to the resources a SIGINT/SIGTERM cleanup needs to release. */
interface AbortRefs {
  pitId: string | null
  fd: number | null
}

interface DumpIndexParams {
  index: string
  query: unknown
  size: number
  keepAlive: string
  write: (chunk: string) => void
  skipIndexName: boolean
  addId: boolean
  abortRefs: AbortRefs
}

/**
 * Best-effort cleanup of resources held by an in-flight dump. Used both by the
 * SIGINT/SIGTERM handlers and (indirectly, via per-index `finally`) by the
 * normal completion path. Idempotent: nulling each ref after release prevents
 * double-close races between the signal handler and the per-index finally.
 */
export async function abortDump (transport: EsClient, refs: AbortRefs): Promise<void> {
  if (refs.fd != null) {
    try { closeSync(refs.fd) } catch { /* best effort */ }
    refs.fd = null
  }
  if (refs.pitId != null) {
    const id = refs.pitId
    refs.pitId = null
    try {
      await transport.request({ method: 'DELETE', path: '/_pit', body: { id } })
    } catch { /* best effort */ }
  }
}

async function dumpOneIndex (transport: EsClient, params: DumpIndexParams): Promise<number> {
  const { index, query, size, keepAlive, write, skipIndexName, addId, abortRefs } = params

  const pitOpen = await transport.request<PitResponse>({
    method: 'POST',
    path: `/${encodeURIComponent(index)}/_pit`,
    querystring: { keep_alive: keepAlive },
  })
  if (pitOpen.id == null) {
    throw new Error(`Failed to open point-in-time for index "${index}"`)
  }
  abortRefs.pitId = pitOpen.id

  // Action-line prefix is invariant across hits when --add-id is off; precompute it.
  // When --add-id is on, only the `_id` field varies, so we still avoid building a
  // throwaway object + JSON.stringify per hit.
  const indexJson = JSON.stringify(index)
  const actionPrefix = addId
    ? (skipIndexName ? '{"index":{"_id":' : `{"index":{"_index":${indexJson},"_id":`)
    : (skipIndexName ? '{"index":{}}' : `{"index":{"_index":${indexJson}}}`)
  const actionSuffix = addId ? '}}' : ''

  let pitId: string = pitOpen.id
  let searchAfter: unknown[] | undefined
  let total = 0

  try {
    while (true) {
      const body: Record<string, unknown> = {
        size,
        pit: { id: pitId, keep_alive: keepAlive },
        query,
        sort: [{ _shard_doc: 'asc' }],
      }
      if (searchAfter != null) body.search_after = searchAfter

      const result = await transport.request<SearchResponse>({
        method: 'POST',
        path: '/_search',
        body,
      })
      const hits = result.hits?.hits ?? []
      if (hits.length === 0) break

      // Build one buffer per page so we issue a single `write` (and therefore
      // a single `writeSync`/`process.stdout.write`) per `size` documents
      // instead of one per hit. Cuts syscalls from O(docs) to O(pages) on the
      // hot path; on a multi-million-doc dump this is the difference between
      // syscall-bound and network-bound.
      const parts: string[] = []
      for (const hit of hits) {
        const actionLine = addId
          ? actionPrefix + JSON.stringify(hit._id) + actionSuffix
          : actionPrefix
        parts.push(actionLine, '\n', JSON.stringify(hit._source), '\n')
      }
      write(parts.join(''))
      total += hits.length

      if (result.pit_id != null) {
        pitId = result.pit_id
        abortRefs.pitId = result.pit_id
      }
      const lastSort = hits[hits.length - 1]!.sort
      if (lastSort == null || lastSort.length === 0) break
      searchAfter = lastSort
    }
  } finally {
    if (abortRefs.pitId === pitId) abortRefs.pitId = null
    try {
      await transport.request({ method: 'DELETE', path: '/_pit', body: { id: pitId } })
    } catch {
      // Best-effort cleanup: the PIT will expire naturally after keep_alive.
    }
  }

  return total
}

function createDumpHandler (deps: DumpDeps = defaultDeps) {
  return async (parsed: { input?: DumpInput, options: Record<string, string | number | boolean> }): Promise<JsonValue> => {
    const opts = parsed.input!
    const jsonMode = parsed.options['json'] === true

    let transport: EsClient
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    if (jsonMode && opts.output == null) {
      return {
        error: {
          code: 'input_error',
          message: '--json requires --output: stats JSON cannot share stdout with streamed NDJSON'
        }
      }
    }

    const indices = opts.indices.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    if (indices.length === 0) {
      return { error: { code: 'input_error', message: '--indices must contain at least one index name' } }
    }

    let query: unknown
    try {
      query = resolveQuery(opts)
    } catch (err) {
      return {
        error: {
          code: 'input_error',
          message: `Failed to parse query: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    const fd = opts.output != null ? openSync(opts.output, 'w') : null
    const write = fd != null
      ? (chunk: string) => { writeSync(fd, chunk) }
      : (chunk: string) => { deps.stdout.write(chunk) }
    const perIndex: Array<{ name: string, docs: number }> = []
    const startTime = Date.now()

    // Refs shared with the signal handler so SIGINT/SIGTERM mid-dump still
    // close the active PIT and flush the output fd before the process exits.
    const abortRefs: AbortRefs = { pitId: null, fd }
    const onAbort = (): void => {
      abortDump(transport, abortRefs).finally(() => {
        // 130 = 128 + SIGINT; matches what a shell reports for Ctrl+C.
        process.exit(130)
      })
    }
    process.on('SIGINT', onAbort)
    process.on('SIGTERM', onAbort)

    try {
      for (const index of indices) {
        const docs = await dumpOneIndex(transport, {
          index,
          query,
          size: opts.size,
          keepAlive: opts.keep_alive,
          write,
          skipIndexName: opts.skip_index_name === true,
          addId: opts.add_id === true,
          abortRefs,
        })
        perIndex.push({ name: index, docs })
      }
    } catch (err) {
      if (fd != null) closeSync(fd)
      process.off('SIGINT', onAbort)
      process.off('SIGTERM', onAbort)
      return transportError(err)
    }

    if (fd != null) closeSync(fd)
    process.off('SIGINT', onAbort)
    process.off('SIGTERM', onAbort)

    const total = perIndex.reduce((n, e) => n + e.docs, 0)
    const elapsed_ms = Date.now() - startTime
    deps.stderr.write(`Dumped ${total} document(s) from ${indices.length} index/indices in ${elapsed_ms}ms\n`)

    return { indices: perIndex, total_docs: total, elapsed_ms }
  }
}

export function createDumpCommand (deps?: DumpDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'dump',
    description: 'Dump one or more indices as bulk-format NDJSON (action + document line pairs), suitable for re-ingestion via the `_bulk` API.',
    input: inputSchema,
    handler: createDumpHandler(deps),
    intent: { destructive: false, idempotent: true, scope: 'global' },
    formatOutput: (result, parsed) => {
      const r = result as Record<string, unknown>
      if (r.error != null) return JSON.stringify(result, null, 2) + '\n'
      // When streaming to stdout, suppress the stats line to keep NDJSON on stdout clean.
      const opts = parsed.input as DumpInput | undefined
      if (opts?.output == null) return ''
      const indices = r.indices as Array<{ name: string, docs: number }>
      const lines = [
        `Output:    ${opts.output}`,
        `Total:     ${r.total_docs}`,
        `Elapsed:   ${r.elapsed_ms}ms`,
        ...indices.map((i) => `  ${i.name}: ${i.docs}`),
      ]
      return lines.join('\n') + '\n'
    }
  })
}
