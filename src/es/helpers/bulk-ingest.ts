/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs'
import type { Transport } from '@elastic/transport'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../../factory.ts'
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

interface BulkIngestOptions {
  index: string
  'input-file'?: string
  'input-dir'?: string
  glob: string
  'no-recursive'?: boolean
  'flush-bytes': number
  concurrency: number
  retries: number
  'retry-delay': number
  pipeline?: string
  routing?: string
}

/** Dependencies injectable for testing. */
export interface BulkIngestDeps {
  getTransport: () => Transport
}

const defaultDeps: BulkIngestDeps = { getTransport }

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
function collectDocuments (opts: BulkIngestOptions): { docs: unknown[], filesProcessed: number } {
  const inputFile = opts['input-file']
  const inputDir = opts['input-dir']

  if (inputFile != null && inputDir != null) {
    throw new Error('Provide only one input source: --input-file or --input-dir (not both)')
  }

  if (inputDir != null) {
    const recursive = opts['no-recursive'] !== true
    const pattern = recursive ? opts.glob : opts.glob.replace(/^\*\*\//, '')
    const files = globFiles(inputDir, pattern)
    if (files.length === 0) {
      throw new Error(`No files matched pattern "${opts.glob}" in ${inputDir}`)
    }
    const allDocs: unknown[] = []
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8')
      allDocs.push(...parseInput(raw))
    }
    return { docs: allDocs, filesProcessed: files.length }
  }

  if (inputFile != null) {
    const raw = readRawInput(inputFile)
    if (raw == null || raw.trim().length === 0) {
      throw new Error('No input data received from file')
    }
    return { docs: parseInput(raw), filesProcessed: 1 }
  }

  // Fall back to stdin
  const raw = readRawInput()
  if (raw == null || raw.trim().length === 0) {
    throw new Error('No input provided. Use --input-file, --input-dir, or pipe data to stdin')
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
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    const opts = parsed.options as unknown as BulkIngestOptions

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

    const flushBytes = opts['flush-bytes']
    const batches = splitIntoBatches(docs, flushBytes)

    const reporter = new ProgressReporter()
    reporter.filesProcessed = filesProcessed

    const retries = opts.retries
    const retryDelay = opts['retry-delay']
    const index = opts.index
    const pipeline = opts.pipeline
    const routing = opts.routing

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
          { retries, delay: retryDelay }
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
    options: [
      { long: 'index', short: 'i', description: 'Target index', type: 'string', required: true },
      { long: 'input-file', description: 'Path to data file (NDJSON or JSON array)', type: 'string' },
      { long: 'input-dir', description: 'Path to directory of data files to ingest', type: 'string' },
      { long: 'glob', description: 'Glob pattern for --input-dir file matching', type: 'string', defaultValue: '**/*.json' },
      { long: 'no-recursive', description: 'Do not recurse into subdirectories when using --input-dir', type: 'boolean' },
      { long: 'flush-bytes', description: 'Batch size threshold in bytes', type: 'number', defaultValue: 5242880 },
      { long: 'concurrency', description: 'Number of parallel bulk requests', type: 'number', defaultValue: 5 },
      { long: 'retries', description: 'Max retries per failed batch', type: 'number', defaultValue: 3 },
      { long: 'retry-delay', description: 'Initial retry delay in ms (doubles each attempt)', type: 'number', defaultValue: 1000 },
      { long: 'pipeline', description: 'Ingest pipeline name', type: 'string' },
      { long: 'routing', description: 'Custom routing value', type: 'string' },
    ],
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
