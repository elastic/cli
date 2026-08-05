/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, globSync } from 'node:fs'
import { resolve } from 'node:path'
import type { JsonValue } from '../../factory.ts'

/**
 * Reads raw text content from a file path or stdin.
 * Returns `undefined` when no input is available (interactive TTY with no file).
 */
export function readRawInput (filePath?: string): string | undefined {
  if (filePath != null) {
    return readFileSync(filePath, 'utf-8')
  }
  if (!process.stdin.isTTY) {
    const content = readFileSync(0, 'utf-8')
    return content.length > 0 ? content : undefined
  }
  return undefined
}

/**
 * Resolves a glob pattern against a directory and returns a sorted list of absolute file paths.
 * Uses Node.js native `fs.globSync` (available since Node 22).
 */
export function globFiles (dir: string, pattern: string): string[] {
  const absDir = resolve(dir)
  const matches = globSync(pattern, { cwd: absDir })
  return matches.map((f) => resolve(absDir, f)).sort()
}

/**
 * Retries an async function with exponential backoff.
 * On each failure the delay doubles. Rethrows the last error after exhausting retries.
 */
export async function retryWithBackoff<T> (
  fn: () => Promise<T>,
  opts: { retries: number, delay: number }
): Promise<T> {
  let lastError: unknown
  let currentDelay = opts.delay
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < opts.retries) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay))
        currentDelay *= 2
      }
    }
  }
  throw lastError
}

/**
 * Runs async tasks with a concurrency limit.
 * Returns results in the same order as the input items.
 */
export async function runWithConcurrency<T, R> (
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker (): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i]!, i)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/** Tracks bulk ingestion progress and writes updates to stderr. */
export class ProgressReporter {
  total = 0
  succeeded = 0
  failed = 0
  retries = 0
  filesProcessed = 0
  private readonly startTime = Date.now()

  report (batchSize: number, batchErrors: number, fileName?: string): void {
    this.total += batchSize
    this.succeeded += batchSize - batchErrors
    this.failed += batchErrors
    const prefix = fileName != null ? `[${fileName}] ` : ''
    process.stderr.write(
      `\r${prefix}Progress: ${this.succeeded} succeeded, ${this.failed} failed, ${this.total} total`
    )
  }

  summary (): JsonValue {
    const elapsed_ms = Date.now() - this.startTime
    process.stderr.write('\n')
    return {
      total: this.total,
      succeeded: this.succeeded,
      failed: this.failed,
      retries: this.retries,
      elapsed_ms,
      ...(this.filesProcessed > 0 && { files_processed: this.filesProcessed })
    }
  }
}
