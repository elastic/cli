/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { readFileSync } from 'node:fs'
import type { Transport } from '@elastic/transport'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getTransport } from '../../lib/transport.ts'
import { missingConfigError, transportError } from '../errors.ts'
import {
  parseInput,
  readRawInput,
  globFiles,
  buildBulkNdjsonBody,
  retryWithBackoff,
  runWithConcurrency,
  ProgressReporter
} from './shared.ts'

/** Dependencies injectable for testing. */
export interface BulkIngestDeps {
  getTransport: () => Transport
}

const defaultDeps: BulkIngestDeps = { getTransport }

const inputSchema = z.object({
  index: z.string().describe('Target index'),
  data_file: z.string().optional().describe('Path to data file (NDJSON or JSON array)'),
  data_dir: z.string().optional().describe('Path to directory of data files to ingest'),
  glob: z.string().default('**/*.json').describe('Glob pattern for --data-dir file matching'),
  no_recursive: z.boolean().optional().describe('Do not recurse into subdirectories when using --data-dir'),
  flush_bytes: z.number().default(5242880).describe('Batch size threshold in bytes'),
  concurrency: z.number().default(5).describe('Number of parallel bulk requests'),
  retries: z.number().default(3).describe('Max retries per failed batch'),
  retry_delay: z.number().default(1000).describe('Initial retry delay in ms (doubles each attempt)'),
  pipeline: z.string().optional().describe('Ingest pipeline name'),
  routing: z.string().optional().describe('Custom routing value'),
})

type BulkIngestInput = z.infer<typeof inputSchema>

/**
 * Splits an array of documents into batches where each batch's serialized
 * size does not exceed the byte threshold.
 */
function splitIntoBatches (docs: unknown[], flushBytes: number): unknown[][] {
  const batches: unknown[][] = []
  let currentBatch: unknown[] = []
  let currentSize = 0

  for (const doc of docs) {
    const docSize = JSON.stringify(doc).length + 1 // +1 for newline
    if (currentBatch.length > 0 && currentSize + docSize > flushBytes) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(doc)
    currentSize += docSize
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }
  return batches
}

/** Collects documents from the resolved input source. */
function collectDocuments (opts: BulkIngestInput): { docs: unknown[], filesProcessed: number } {
  const { data_file, data_dir } = opts

  if (data_file != null && data_dir != null) {
    throw new Error('Provide only one input source: --data-file or --data-dir (not both)')
  }

  if (data_dir != null) {
    const recursive = opts.no_recursive !== true
    const pattern = recursive ? opts.glob : opts.glob.replace(/^\*\*\//, '')
    const files = globFiles(data_dir, pattern)
    if (files.length === 0) {
      throw new Error(`No files matched pattern "${opts.glob}" in ${data_dir}`)
    }
    const allDocs: unknown[] = []
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8')
      allDocs.push(...parseInput(raw))
    }
    return { docs: allDocs, filesProcessed: files.length }
  }

  if (data_file != null) {
    const raw = readRawInput(data_file)
    if (raw == null || raw.trim().length === 0) {
      throw new Error('No input data received from file')
    }
    return { docs: parseInput(raw), filesProcessed: 1 }
  }

  // Fall back to stdin
  const raw = readRawInput()
  if (raw == null || raw.trim().length === 0) {
    throw new Error('No input provided. Use --data-file, --data-dir, or pipe data to stdin')
  }
  return { docs: parseInput(raw), filesProcessed: 0 }
}

/** Sends a single bulk batch to Elasticsearch. Returns the count of errors. */
async function sendBatch (
  transport: Transport,
  ndjsonBody: string,
  index: string
): Promise<{ errors: number, total: number }> {
  const path = index != null ? `/${encodeURIComponent(index)}/_bulk` : '/_bulk'
  const result = await transport.request(
    { method: 'POST', path, body: ndjsonBody, bulkBody: ndjsonBody },
    { headers: { 'content-type': 'application/x-ndjson' } }
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

    let transport: Transport
    try {
      transport = deps.getTransport()
    } catch (err) {
      return missingConfigError(err)
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

export function createBulkIngestCommand (deps?: BulkIngestDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'bulk-ingest',
    description: 'Bulk-ingest documents from file, directory, or stdin with automatic batching, concurrency, and retries.',
    input: inputSchema,
    handler: createBulkIngestHandler(deps),
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
