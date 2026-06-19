/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { readFileSync } from 'node:fs'
import type { EsClient } from '../../lib/es-client.ts'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getEsClient } from '../../lib/es-client.ts'
import { missingConfigError, transportError } from '../errors.ts'
import {
  parseInput,
  parseCsvInput,
  readRawInput,
  globFiles,
  buildBulkNdjsonBody,
  retryWithBackoff,
  runWithConcurrency,
  ProgressReporter
} from './shared.ts'

/** Dependencies injectable for testing. */
export interface BulkIngestDeps {
  getEsClient: () => EsClient
}

const defaultDeps: BulkIngestDeps = { getEsClient }

const SOURCE_FORMATS = ['ndjson', 'json', 'csv', 'bulk-ndjson'] as const
type SourceFormat = typeof SOURCE_FORMATS[number]

const inputSchema = z.object({
  index: z.string().optional().describe('Target index (required unless --source-format bulk-ndjson, in which case action lines may carry _index)'),
  data_file: z.string().optional().describe('Path to data file (NDJSON, JSON array, CSV, or pre-formatted bulk NDJSON)'),
  data_dir: z.string().optional().describe('Path to directory of data files to ingest'),
  glob: z.string().optional().describe('Glob pattern for --data-dir file matching (default: **/*.json, or **/*.csv when --source-format csv)'),
  no_recursive: z.boolean().optional().describe('Do not recurse into subdirectories when using --data-dir'),
  source_format: z.enum(SOURCE_FORMATS).default('ndjson').describe('Input file format: ndjson (one doc per line), json (JSON array or one doc per line), csv, or bulk-ndjson (already-formatted action+doc line pairs, as produced by `dump`)'),
  csv_delimiter: z.string().optional().describe('CSV column delimiter (default: ",")'),
  csv_columns: z.string().optional().describe('Comma-separated list of column names (overrides CSV header row)'),
  skip_header: z.boolean().optional().describe('Skip the first row of a CSV file'),
  flush_bytes: z.number().default(5242880).describe('Batch size threshold in bytes'),
  concurrency: z.number().default(5).describe('Number of parallel bulk requests'),
  retries: z.number().default(3).describe('Max retries per failed batch'),
  retry_delay: z.number().default(1000).describe('Initial retry delay in ms (doubles each attempt)'),
  pipeline: z.string().optional().describe('Ingest pipeline name'),
  routing: z.string().optional().describe('Custom routing value'),
})

type BulkIngestInput = z.infer<typeof inputSchema>

/**
 * Splits items into batches where each batch's serialized size does not exceed
 * `flushBytes`. `sizeOf` defaults to the JSON-serialised byte length plus a
 * trailing newline; pass a custom callback for items already represented as
 * strings (e.g. pre-formatted bulk pairs).
 */
function splitIntoBatches<T> (
  items: T[],
  flushBytes: number,
  sizeOf: (item: T) => number = (i) => JSON.stringify(i).length + 1,
): T[][] {
  const batches: T[][] = []
  let currentBatch: T[] = []
  let currentSize = 0

  for (const item of items) {
    const itemSize = sizeOf(item)
    if (currentBatch.length > 0 && currentSize + itemSize > flushBytes) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(item)
    currentSize += itemSize
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }
  return batches
}

/** Parses raw file content according to the selected source format. */
function parseByFormat (raw: string, opts: BulkIngestInput): unknown[] {
  if (opts.source_format === 'csv') {
    const csvColumns = opts.csv_columns != null
      ? opts.csv_columns.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined
    return parseCsvInput(raw, {
      ...(opts.csv_delimiter != null && { delimiter: opts.csv_delimiter }),
      ...(csvColumns != null && { columns: csvColumns }),
      ...(opts.skip_header != null && { skipHeader: opts.skip_header }),
    })
  }
  return parseInput(raw)
}

/** Returns the default glob pattern for the given source format. */
function defaultGlob (format: SourceFormat): string {
  if (format === 'csv') return '**/*.csv'
  if (format === 'bulk-ndjson') return '**/*.ndjson'
  return '**/*.{json,ndjson,jsonl}'
}

// Only `index` and `create` are supported. The pair parser assumes every action
// is followed by a document line, which holds for both. `delete` actions carry
// no document line, and `update` actions require a `{"doc": ...}` envelope —
// neither shape is emitted by `dump` (the producer this format is designed for),
// so rejecting them keeps the parser simple and avoids silently corrupting input
// that does not match the expected pair structure.
const BULK_ACTIONS = new Set(['index', 'create'])

/**
 * Parses raw text containing pre-formatted bulk action+doc line pairs.
 * Each pair is returned as an `"action\ndoc"` string ready to be joined into a `_bulk` body.
 * Only `index` and `create` actions are supported (see `BULK_ACTIONS`).
 */
export function parseBulkNdjsonPairs (raw: string): string[] {
  const pairs: string[] = []
  let action: string | undefined
  let lineNum = 0
  let nonEmptyCount = 0

  for (const line of raw.split('\n')) {
    lineNum++
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    nonEmptyCount++

    if (action == null) {
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch (err) {
        throw new Error(`bulk-ndjson: invalid action line at line ${lineNum}: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
      }
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`bulk-ndjson: invalid action line at line ${lineNum}: expected an object`)
      }
      const keys = Object.keys(parsed as Record<string, unknown>)
      if (keys.length !== 1 || !BULK_ACTIONS.has(keys[0]!)) {
        throw new Error(`bulk-ndjson: invalid action line at line ${lineNum}: expected {"index"|"create": ...}, got: ${trimmed.slice(0, 80)} (delete/update are not supported in pre-formatted bulk-ndjson because their doc shape differs)`)
      }
      action = trimmed
    } else {
      pairs.push(`${action}\n${trimmed}`)
      action = undefined
    }
  }

  if (action != null) {
    throw new Error(`bulk-ndjson: expected an even number of non-empty lines (action + doc pairs), got ${nonEmptyCount}`)
  }
  return pairs
}

/**
 * Resolves the active input source (file, glob'd directory, or stdin) and returns
 * one raw text chunk per source. `filesProcessed` is 0 when reading from stdin.
 */
function resolveRawInputs (opts: BulkIngestInput): { raws: string[], filesProcessed: number } {
  const { data_file, data_dir } = opts

  if (data_file != null && data_dir != null) {
    throw new Error('Provide only one input source: --data-file or --data-dir (not both)')
  }

  if (data_dir != null) {
    const pattern = opts.glob ?? defaultGlob(opts.source_format)
    const recursive = opts.no_recursive !== true
    const resolvedPattern = recursive ? pattern : pattern.replace(/^\*\*\//, '')
    const files = globFiles(data_dir, resolvedPattern)
    if (files.length === 0) {
      throw new Error(`No files matched pattern "${resolvedPattern}" in ${data_dir}`)
    }
    return {
      raws: files.map((f) => readFileSync(f, 'utf-8')),
      filesProcessed: files.length,
    }
  }

  if (data_file != null) {
    const raw = readRawInput(data_file)
    if (raw == null || raw.trim().length === 0) {
      throw new Error('No input data received from file')
    }
    return { raws: [raw], filesProcessed: 1 }
  }

  const raw = readRawInput()
  if (raw == null || raw.trim().length === 0) {
    throw new Error('No input provided. Use --data-file, --data-dir, or pipe data to stdin')
  }
  return { raws: [raw], filesProcessed: 0 }
}

/** Collects documents from the resolved input source. */
function collectDocuments (opts: BulkIngestInput): { docs: unknown[], filesProcessed: number } {
  const { raws, filesProcessed } = resolveRawInputs(opts)
  const docs: unknown[] = []
  for (const raw of raws) docs.push(...parseByFormat(raw, opts))
  return { docs, filesProcessed }
}

/** Sends a single bulk batch to Elasticsearch. Returns the count of errors. */
async function sendBatch (
  transport: EsClient,
  ndjsonBody: string,
  index: string | undefined,
  qs?: { pipeline?: string | undefined, routing?: string | undefined }
): Promise<{ errors: number, total: number }> {
  const path = index != null ? `/${encodeURIComponent(index)}/_bulk` : '/_bulk'
  const querystring: Record<string, string> = {}
  if (qs?.pipeline != null) querystring.pipeline = qs.pipeline
  if (qs?.routing != null) querystring.routing = qs.routing
  const result = await transport.request(
    {
      method: 'POST',
      path,
      body: ndjsonBody,
      bulkBody: ndjsonBody,
      ...(Object.keys(querystring).length > 0 && { querystring }),
    }
  ) as { errors?: boolean, items?: Array<Record<string, { status?: number }>> }

  let errorCount = 0
  if (result.errors === true && result.items != null) {
    for (const item of result.items) {
      const action = Object.values(item)[0]
      if (action != null && action.status != null && action.status >= 400) {
        errorCount++
      }
    }
  }
  const total = result.items?.length ?? 0
  return { errors: errorCount, total }
}

function createBulkIngestHandler (deps: BulkIngestDeps = defaultDeps) {
  return async (parsed: { input?: BulkIngestInput; options: Record<string, string | number | boolean> }): Promise<JsonValue> => {
    const opts = parsed.input!

    if (opts.source_format !== 'bulk-ndjson' && opts.index == null) {
      return { error: { code: 'input_error', message: '--index is required (omit only when --source-format bulk-ndjson)' } }
    }

    let transport: EsClient
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    if (opts.source_format === 'bulk-ndjson') {
      return runBulkNdjson(opts, transport)
    }

    let docs: unknown[]
    let filesProcessed: number
    try {
      const result = collectDocuments(opts)
      docs = result.docs
      filesProcessed = result.filesProcessed
    } catch (err) {
      return {
        error: {
          code: 'input_error',
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }

    if (docs.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, retries: 0, elapsed_ms: 0 }
    }

    const batches = splitIntoBatches(docs, opts.flush_bytes)

    const reporter = new ProgressReporter()
    reporter.filesProcessed = filesProcessed

    const { retries, retry_delay, index, pipeline, routing } = opts

    try {
      await runWithConcurrency(batches, opts.concurrency, async (batch) => {
        const ndjsonBody = buildBulkNdjsonBody(batch, { index, pipeline, routing })

        const result = await retryWithBackoff(
          async () => {
            const res = await sendBatch(transport, ndjsonBody, index)
            if (res.errors > 0) {
              // Only retry if all items failed (likely a transient cluster issue)
              // Partial failures are reported as-is
              if (res.errors === res.total) {
                throw new Error(`Bulk batch failed: ${res.errors}/${res.total} errors`)
              }
            }
            return res
          },
          { retries, delay: retry_delay }
        )

        reporter.report(result.total, result.errors)
        return result
      })
    } catch (err) {
      // If retries exhausted, report what we have so far
      return transportError(err)
    }

    return reporter.summary()
  }
}

/**
 * Ingests pre-formatted bulk NDJSON (action + document line pairs, as produced by `dump`).
 * Reuses retry, concurrency, and progress reporting from the main flow; the only difference
 * is that the input is already bulk-shaped, so each pair is sent through verbatim.
 */
async function runBulkNdjson (opts: BulkIngestInput, transport: EsClient): Promise<JsonValue> {
  let pairs: string[]
  let filesProcessed: number
  try {
    const resolved = resolveRawInputs(opts)
    pairs = resolved.raws.flatMap(parseBulkNdjsonPairs)
    filesProcessed = resolved.filesProcessed
  } catch (err) {
    return { error: { code: 'input_error', message: err instanceof Error ? err.message : String(err) } }
  }

  if (pairs.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, retries: 0, elapsed_ms: 0 }
  }

  const batches = splitIntoBatches(pairs, opts.flush_bytes, (p) => p.length + 1)
  const reporter = new ProgressReporter()
  reporter.filesProcessed = filesProcessed

  try {
    await runWithConcurrency(batches, opts.concurrency, async (batch) => {
      const body = batch.join('\n') + '\n'
      const result = await retryWithBackoff(
        async () => {
          // Apply pipeline/routing as URL query params so they affect every
          // action in the batch (the action lines are pre-formatted and we do
          // not rewrite them).
          const res = await sendBatch(transport, body, opts.index, { pipeline: opts.pipeline, routing: opts.routing })
          if (res.errors > 0 && res.errors === res.total) {
            throw new Error(`Bulk batch failed: ${res.errors}/${res.total} errors`)
          }
          return res
        },
        { retries: opts.retries, delay: opts.retry_delay }
      )
      reporter.report(result.total, result.errors)
      return result
    })
  } catch (err) {
    return transportError(err)
  }

  return reporter.summary()
}

export function createBulkIngestCommand (deps?: BulkIngestDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'bulk-ingest',
    description: 'Bulk-ingest documents from file, directory, or stdin with automatic batching, concurrency, and retries.',
    input: inputSchema,
    handler: createBulkIngestHandler(deps),
    intent: { destructive: false, idempotent: false, scope: 'global' },
    formatOutput: (result) => {
      const r = result as Record<string, unknown>
      if (r.error != null) return JSON.stringify(result, null, 2) + '\n'
      const lines = [
        `Total:     ${r.total}`,
        `Succeeded: ${r.succeeded}`,
        `Failed:    ${r.failed}`,
        `Retries:   ${r.retries}`,
        `Elapsed:   ${r.elapsed_ms}ms`,
      ]
      if (r.files_processed != null) {
        lines.push(`Files:     ${r.files_processed}`)
      }
      return lines.join('\n') + '\n'
    }
  })
}
