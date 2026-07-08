/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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

const SOURCE_FORMATS = ['ndjson', 'json', 'csv'] as const
type SourceFormat = typeof SOURCE_FORMATS[number]

const inputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    index: { type: 'string', description: 'Target index' },
    data_file: { type: 'string', description: 'Path to data file (NDJSON, JSON array, or CSV)' },
    data_dir: { type: 'string', description: 'Path to directory of data files to ingest' },
    glob: { type: 'string', description: 'Glob pattern for --data-dir file matching (default: **/*.json, or **/*.csv when --source-format csv)' },
    no_recursive: { type: 'boolean', description: 'Do not recurse into subdirectories when using --data-dir' },
    source_format: { type: 'string', enum: SOURCE_FORMATS, description: 'Input file format: ndjson, json, or csv', default: 'ndjson' },
    csv_delimiter: { type: 'string', description: 'CSV column delimiter (default: ",")' },
    csv_columns: { type: 'string', description: 'Comma-separated list of column names (overrides CSV header row)' },
    skip_header: { type: 'boolean', description: 'Skip the first row of a CSV file' },
    flush_bytes: { type: 'integer', description: 'Batch size threshold in bytes', default: 5242880 },
    concurrency: { type: 'integer', description: 'Number of parallel bulk requests', default: 5 },
    retries: { type: 'integer', description: 'Max retries per failed batch', default: 3 },
    retry_delay: { type: 'integer', description: 'Initial retry delay in ms (doubles each attempt)', default: 1000 },
    pipeline: { type: 'string', description: 'Ingest pipeline name' },
    routing: { type: 'string', description: 'Custom routing value' },
  },
  required: ['index'],
}

interface BulkIngestInput {
  index: string
  data_file?: string
  data_dir?: string
  glob?: string
  no_recursive?: boolean
  source_format: SourceFormat
  csv_delimiter?: string
  csv_columns?: string
  skip_header?: boolean
  flush_bytes: number
  concurrency: number
  retries: number
  retry_delay: number
  pipeline?: string
  routing?: string
}

function splitIntoBatches (docs: unknown[], flushBytes: number): unknown[][] {
  const batches: unknown[][] = []
  let currentBatch: unknown[] = []
  let currentSize = 0

  for (const doc of docs) {
    const docSize = JSON.stringify(doc).length + 1
    if (currentBatch.length > 0 && currentSize + docSize > flushBytes) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(doc)
    currentSize += docSize
  }
  if (currentBatch.length > 0) batches.push(currentBatch)
  return batches
}

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

function defaultGlob (format: SourceFormat): string {
  if (format === 'csv') return '**/*.csv'
  return '**/*.{json,ndjson,jsonl}'
}

function collectDocuments (opts: BulkIngestInput): { docs: unknown[], filesProcessed: number } {
  const { data_file, data_dir } = opts

  if (data_file != null && data_dir != null) {
    throw new Error('Provide only one input source: --data-file or --data-dir (not both)')
  }

  if (data_dir != null) {
    const pattern = opts.glob ?? defaultGlob(opts.source_format)
    const recursive = opts.no_recursive !== true
    const resolvedPattern = recursive ? pattern : pattern.replace(/^\*\*\//, '')
    const files = globFiles(data_dir, resolvedPattern)
    if (files.length === 0) throw new Error(`No files matched pattern "${resolvedPattern}" in ${data_dir}`)
    const allDocs: unknown[] = []
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8')
      allDocs.push(...parseByFormat(raw, opts))
    }
    return { docs: allDocs, filesProcessed: files.length }
  }

  if (data_file != null) {
    const raw = readRawInput(data_file)
    if (raw == null || raw.trim().length === 0) throw new Error('No input data received from file')
    return { docs: parseByFormat(raw, opts), filesProcessed: 1 }
  }

  const raw = readRawInput()
  if (raw == null || raw.trim().length === 0) {
    throw new Error('No input provided. Use --data-file, --data-dir, or pipe data to stdin')
  }
  return { docs: parseByFormat(raw, opts), filesProcessed: 0 }
}

async function sendBatch (
  transport: EsClient,
  ndjsonBody: string,
  index: string
): Promise<{ errors: number, total: number }> {
  const path = `/${encodeURIComponent(index)}/_bulk`
  const result = await transport.request(
    { method: 'POST', path, body: ndjsonBody, bulkBody: ndjsonBody }
  ) as { errors?: boolean, items?: Array<Record<string, { status?: number }>> }

  let errorCount = 0
  if (result.errors === true && result.items != null) {
    for (const item of result.items) {
      const action = Object.values(item)[0]
      if (action != null && action.status != null && action.status >= 400) errorCount++
    }
  }
  return { errors: errorCount, total: result.items?.length ?? 0 }
}

function createBulkIngestHandler (deps: BulkIngestDeps = defaultDeps) {
  return async (parsed: import("../../factory.ts").ParsedResult): Promise<JsonValue> => {
    const opts = parsed.input as BulkIngestInput

    let transport: EsClient
    try { transport = deps.getEsClient() } catch (err) { return missingConfigError(err) }

    let docs: unknown[]
    let filesProcessed: number
    try {
      const result = collectDocuments(opts)
      docs = result.docs
      filesProcessed = result.filesProcessed
    } catch (err) {
      return { error: { code: 'input_error', message: err instanceof Error ? err.message : String(err) } }
    }

    if (docs.length === 0) return { total: 0, succeeded: 0, failed: 0, retries: 0, elapsed_ms: 0 }

    const batches = splitIntoBatches(docs, opts.flush_bytes)
    const reporter = new ProgressReporter()
    reporter.filesProcessed = filesProcessed

    try {
      await runWithConcurrency(batches, opts.concurrency, async (batch) => {
        const ndjsonBody = buildBulkNdjsonBody(batch, {
          index: opts.index,
          pipeline: opts.pipeline,
          routing: opts.routing
        })
        const result = await retryWithBackoff(
          async () => {
            const res = await sendBatch(transport, ndjsonBody, opts.index)
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
      return [
        `Total:     ${r.total}`,
        `Succeeded: ${r.succeeded}`,
        `Failed:    ${r.failed}`,
        `Retries:   ${r.retries}`,
        `Elapsed:   ${r.elapsed_ms}ms`,
        ...(r.files_processed != null ? [`Files:     ${r.files_processed}`] : []),
      ].join('\n') + '\n'
    }
  })
}
