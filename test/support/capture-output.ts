/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CapturedProcessOutput {
  stdout: string
  stderr: string
}

/**
 * Captures process output while an asynchronous operation runs.
 */
export async function captureProcessOutput (run: () => Promise<unknown>): Promise<CapturedProcessOutput> {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const originalStdoutWrite = process.stdout.write
  const originalStderrWrite = process.stderr.write

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk))
    return true
  }) as typeof process.stderr.write

  try {
    await run()
  } finally {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  }

  return {
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  }
}
