/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from '@elastic/transport'
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../../factory.ts'
import { getTransport } from '../../lib/transport.ts'
import { missingConfigError, transportError } from '../errors.ts'
import { readRawInput, runWithConcurrency } from './shared.ts'

interface MsearchOptions {
  index?: string | undefined
  'input-file'?: string | undefined
  'batch-size': number
  concurrency: number
}

interface SearchItem {
  header?: Record<string, unknown>
  body: Record<string, unknown>
}

interface MsearchResponse {
  responses?: JsonValue[]
}

/** Dependencies injectable for testing. */
export interface MsearchDeps {
  getTransport: () => Transport
}

const defaultDeps: MsearchDeps = { getTransport }

/** Builds the NDJSON body for _msearch: alternating header/body lines. */
function buildMsearchNdjsonBody (items: SearchItem[], defaultIndex?: string | undefined): string {
  const lines: string[] = []
  for (const item of items) {
    const header = { ...item.header }
    if (header.index == null && defaultIndex != null) {
      header.index = defaultIndex
    }
    lines.push(JSON.stringify(header))
    lines.push(JSON.stringify(item.body))
  }
  return lines.join('\n') + '\n'
}

/** Parses raw input into an array of search items. */
function parseSearchItems (raw: string): SearchItem[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of search objects')
  }
  return parsed.map((item: unknown, i: number) => {
    if (item == null || typeof item !== 'object') {
      throw new Error(`Search item at index ${i} must be an object`)
    }
    const obj = item as Record<string, unknown>
    if (obj.body == null || typeof obj.body !== 'object') {
      throw new Error(`Search item at index ${i} must have a "body" object`)
    }
    return {
      header: (obj.header as Record<string, unknown> | undefined) ?? {},
      body: obj.body as Record<string, unknown>
    }
  })
}

function createMsearchHandler (deps: MsearchDeps = defaultDeps) {
  return async (parsed: ParsedResult): Promise<JsonValue> => {
    const opts = parsed.options as unknown as MsearchOptions

    let transport: Transport
    try {
      transport = deps.getTransport()
    } catch (err) {
      return missingConfigError(err)
    }

    // Read and parse input
    let items: SearchItem[]
    try {
      let raw: string | undefined
      if (opts['input-file'] != null) {
        raw = readRawInput(opts['input-file'])
      } else if (!process.stdin.isTTY) {
        raw = readRawInput()
      }
      if (raw == null || raw.trim().length === 0) {
        return {
          error: {
            code: 'input_error',
            message: 'No input provided. Use --input-file or pipe data to stdin'
          }
        }
      }
      items = parseSearchItems(raw)
    } catch (err) {
      return {
        error: {
          code: 'input_error',
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }

    if (items.length === 0) {
      return { responses: [] }
    }

    // Split into batches
    const batchSize = opts['batch-size']
    const batches: SearchItem[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }

    // Build path
    const path = opts.index != null
      ? `/${encodeURIComponent(opts.index)}/_msearch`
      : '/_msearch'

    try {
      const allResponses: JsonValue[] = []

      await runWithConcurrency(batches, opts.concurrency, async (batch) => {
        const ndjsonBody = buildMsearchNdjsonBody(batch, opts.index)
        const result = await transport.request<MsearchResponse>(
          { method: 'POST', path, body: ndjsonBody },
          { headers: { 'content-type': 'application/x-ndjson' } }
        )
        if (result.responses != null) {
          allResponses.push(...result.responses)
        }
        return result
      })

      return { responses: allResponses }
    } catch (err) {
      return transportError(err)
    }
  }
}

export function createMsearchCommand (deps?: MsearchDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'msearch',
    description: 'Batch multiple search requests via _msearch with configurable batch size and concurrency.',
    options: [
      { long: 'index', short: 'i', description: 'Default index for searches', type: 'string' },
      { long: 'input-file', description: 'Path to JSON file with search array', type: 'string' },
      { long: 'batch-size', description: 'Searches per _msearch request', type: 'number', defaultValue: 5 },
      { long: 'concurrency', description: 'Parallel _msearch requests', type: 'number', defaultValue: 5 },
    ],
    handler: createMsearchHandler(deps)
  })
}
