/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { parse as parseCsvStream } from 'csv-parse'
import type { EsClient } from '../../lib/es-client.ts'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getEsClient } from '../../lib/es-client.ts'
import { missingConfigError, transportError } from '../errors.ts'
import {
  globFiles,
  retryWithBackoff,
  ProgressReporter
} from './shared.ts'

/** Dependencies injectable for testing. */
export interface BulkIngestDeps {
  getEsClient: () => EsClient
}

const defaultDeps: BulkIngestDeps = { getEsClient }

const SOURCE_FORMATS = ['ndjson', 'json', 'csv'] as const
type SourceFormat = typeof SOURCE_FORMATS[number]

const inputSchema = z.object({
  index: z.string().describe('Target index'),
  data_file: z.string().optional().describe('Path to data file (NDJSON, JSON array, or CSV)'),
  data_dir: z.string().optional().describe('Path to directory of data files to ingest'),
  glob: z.string().optional().describe('Glob pattern for --data-dir file matching (default: **/*.json, or **/*.csv when --source-format csv)'),
  no_recursive: z.boolean().optional().describe('Do not recurse into subdirectories when using --data-dir'),
  source_format: z.enum(SOURCE_FORMATS).default('ndjson').describe('Input file format: ndjson, json, or csv'),
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

/** Bounded concurrency via a counting semaphore. */
class Semaphore {
  private count: number
  private readonly waiters: Array<() => void> = []

  constructor (n: number) { this.count = n }

  async acquire (): Promise<void> {
    if (this.count > 0) { this.count--; return }
    await new Promise<void>(r => this.waiters.push(r))
  }

  release (): void {
    const next = this.waiters.shift()
    if (next != null) next()
    else this.count++
  }
}

/**
 * Extracts top-level elements from a streamed JSON array (`[doc, doc, ...]`)
 * without ever holding the whole array in memory. Feed it text chunks in
 * order via {@link feed}; it returns each complete top-level element (as
 * unparsed JSON text) as soon as its closing delimiter is seen. Only the
 * current in-progress element is buffered, so memory is bounded by the
 * largest single element, not the file size.
 */
class JsonArraySplitter {
  private started = false
  private closed = false
  private depth = 0
  private inString = false
  private escaped = false
  private buf = ''
  private hasContent = false

  feed (chunk: string): string[] {
    const elements: string[] = []
    for (let i = 0; i < chunk.length && !this.closed; i++) {
      const c = chunk[i]!

      if (!this.started) {
        if (c === '[') this.started = true
        continue
      }

      if (this.inString) {
        this.buf += c
        if (this.escaped) this.escaped = false
        else if (c === '\\') this.escaped = true
        else if (c === '"') this.inString = false
        continue
      }

      if (this.depth > 0) {
        if (c === '"') this.inString = true
        else if (c === '{' || c === '[') this.depth++
        else if (c === '}' || c === ']') this.depth--
        this.buf += c
        continue
      }

      // depth === 0: between elements, or inside an unbracketed scalar (number/bool/null/string)
      if (c === '"') {
        this.inString = true
        this.buf += c
        this.hasContent = true
      } else if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ',') {
        if (this.hasContent) elements.push(this.emit())
      } else if (c === ']') {
        if (this.hasContent) elements.push(this.emit())
        this.closed = true
      } else {
        if (c === '{' || c === '[') this.depth++
        this.buf += c
        this.hasContent = true
      }
    }
    return elements
  }

  /** True once the closing `]` of the array has been consumed. */
  isClosed (): boolean {
    return this.closed
  }

  private emit (): string {
    const el = this.buf
    this.buf = ''
    this.hasContent = false
    return el
  }
}

/** Returns the default glob pattern for the given source format. */
function defaultGlob (format: SourceFormat): string {
  if (format === 'csv') return '**/*.csv'
  return '**/*.{json,ndjson,jsonl}'
}

/** Sends a single bulk batch to Elasticsearch. Returns the count of errors. */
async function sendBatch (
  transport: EsClient,
  ndjsonBody: string,
  index: string
): Promise<{ errors: number, total: number }> {
  const path = index != null ? `/${encodeURIComponent(index)}/_bulk` : '/_bulk'
  const result = await transport.request(
    { method: 'POST', path, body: ndjsonBody, bulkBody: ndjsonBody }
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

/**
 * Streams documents from all input sources and sends them as bulk batches.
 *
 * Peak memory is bounded by flush_bytes * concurrency regardless of input size.
 * The semaphore provides backpressure: the producer blocks once concurrency
 * slots are exhausted, preventing unbounded batch accumulation.
 */
async function streamBulkIngest (
  opts: BulkIngestInput,
  transport: EsClient,
  reporter: ProgressReporter
): Promise<void> {
  const { flush_bytes, concurrency, retries, retry_delay, index, pipeline, routing } = opts

  const actionLine = JSON.stringify({
    index: {
      ...(index != null && { _index: index }),
      ...(pipeline != null && { pipeline }),
      ...(routing != null && { routing }),
    }
  })

  const sem = new Semaphore(concurrency)
  const errors: unknown[] = []

  let buf = ''
  let bufBytes = 0

  const submitBatch = async (body: string): Promise<void> => {
    await sem.acquire()
    // Fire-and-forget: producer continues reading while this batch is in flight.
    retryWithBackoff(
      async () => {
        const res = await sendBatch(transport, body, index)
        if (res.errors > 0 && res.errors === res.total) {
          throw new Error(`Bulk batch failed: ${res.errors}/${res.total} errors`)
        }
        return res
      },
      { retries, delay: retry_delay }
    ).then(res => {
      reporter.report(res.total, res.errors)
    }).catch(err => {
      errors.push(err)
    }).finally(() => sem.release())
  }

  const flush = async (): Promise<void> => {
    if (bufBytes === 0) return
    const body = buf
    buf = ''
    bufBytes = 0
    await submitBatch(body)
  }

  const addDoc = async (docJson: string): Promise<void> => {
    const pair = actionLine + '\n' + docJson + '\n'
    buf += pair
    bufBytes += pair.length
    if (bufBytes >= flush_bytes) await flush()
  }

  // Resolve file list
  const { data_file, data_dir, source_format } = opts

  if (data_file != null && data_dir != null) {
    throw Object.assign(new Error('Provide only one input source: --data-file or --data-dir (not both)'), { code: 'input_error' })
  }

  let filePaths: Array<string | undefined>

  if (data_dir != null) {
    const pattern = opts.glob ?? defaultGlob(source_format)
    const recursive = opts.no_recursive !== true
    const resolvedPattern = recursive ? pattern : pattern.replace(/^\*\*\//, '')
    const found = globFiles(data_dir, resolvedPattern)
    if (found.length === 0) {
      throw Object.assign(new Error(`No files matched pattern "${resolvedPattern}" in ${data_dir}`), { code: 'input_error' })
    }
    reporter.filesProcessed = found.length
    filePaths = found
  } else if (data_file != null) {
    reporter.filesProcessed = 1
    filePaths = [data_file]
  } else {
    if (process.stdin.isTTY === true) {
      throw Object.assign(new Error('No input provided. Use --data-file, --data-dir, or pipe data to stdin'), { code: 'input_error' })
    }
    filePaths = [undefined]
  }

  for (const filePath of filePaths) {
    const stream: Readable = filePath != null ? createReadStream(filePath, { encoding: 'utf-8' }) : process.stdin

    if (source_format === 'csv') {
      const csvColumns = opts.csv_columns != null
        ? opts.csv_columns.split(',').map(c => c.trim()).filter(Boolean)
        : undefined
      const parser = parseCsvStream({
        delimiter: opts.csv_delimiter ?? ',',
        columns: csvColumns != null && csvColumns.length > 0 ? csvColumns : true,
        from_line: opts.skip_header === true ? 2 : 1,
        skip_empty_lines: true,
        trim: true,
        cast (value) {
          if (value === 'true') return true
          if (value === 'false') return false
          if (value !== '' && !isNaN(Number(value))) return Number(value)
          return value
        }
      })
      stream.pipe(parser)
      for await (const record of parser) {
        await addDoc(JSON.stringify(record))
      }
    } else {
      // ndjson: line-by-line. json (JSON array): streamed element-by-element via
      // JsonArraySplitter, so a multi-GB array never gets buffered whole.
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      let isJsonArray: boolean | null = null // null = not yet determined
      const arraySplitter = new JsonArraySplitter()

      for await (const line of rl) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue

        if (isJsonArray === null) {
          isJsonArray = trimmed.startsWith('[')
        }

        if (isJsonArray) {
          for (const element of arraySplitter.feed(line + '\n')) {
            let doc: unknown
            try {
              doc = JSON.parse(element)
            } catch {
              throw new Error(`Failed to parse JSON array element: ${element.slice(0, 80)}`)
            }
            await addDoc(JSON.stringify(doc))
          }
          continue
        }

        try {
          await addDoc(JSON.stringify(JSON.parse(trimmed)))
        } catch {
          throw new Error(`Failed to parse NDJSON line: ${trimmed.slice(0, 80)}`)
        }
      }

      if (isJsonArray === true && !arraySplitter.isClosed()) {
        throw new Error('Unexpected end of input: JSON array was not closed')
      }
    }
  }

  await flush()

  // Drain: acquire all slots to confirm every in-flight batch has finished.
  for (let i = 0; i < concurrency; i++) {
    await sem.acquire()
  }

  if (errors.length > 0) throw errors[0]
}

function createBulkIngestHandler (deps: BulkIngestDeps = defaultDeps) {
  return async (parsed: { input?: BulkIngestInput; options: Record<string, string | number | boolean> }): Promise<JsonValue> => {
    const opts = parsed.input!

    let transport: EsClient
    try {
      transport = deps.getEsClient()
    } catch (err) {
      return missingConfigError(err)
    }

    const reporter = new ProgressReporter()

    try {
      await streamBulkIngest(opts, transport, reporter)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'input_error' || (err instanceof Error && (
        err.message.startsWith('No files matched') ||
        err.message.startsWith('Provide only one') ||
        err.message.startsWith('No input provided') ||
        err.message.startsWith('Failed to parse') ||
        err.message.startsWith('Unexpected end of input')
      ))) {
        return {
          error: {
            code: 'input_error',
            message: err instanceof Error ? err.message : String(err)
          }
        }
      }
      return transportError(err)
    }

    return reporter.summary()
  }
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
