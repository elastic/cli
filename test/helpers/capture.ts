/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mock } from 'node:test'
import type { MockTracker, TestContext } from 'node:test'

/** Every string written to the process streams while a capture was active. */
export interface Captured {
  stdout: string[]
  stderr: string[]
}

/** In-memory stand-ins for the `stdout`/`stderr` dependencies injected into command factories. */
export interface OutputSink {
  stdout: { chunks: string[], write: (s: string) => boolean }
  stderr: { chunks: string[], write: (s: string) => boolean }
}

// Non-string chunks (e.g. the node:test reporter's serialized Buffers) are
// forwarded to the real stream so the runner's IPC channel is never corrupted
// when this runs inside a spawned test subprocess.
function install (tracker: MockTracker): { captured: Captured, restore: () => void } {
  const captured: Captured = { stdout: [], stderr: [] }
  const restores = (['stdout', 'stderr'] as const).map((name) => {
    const stream = process[name]
    const original = stream.write
    const patch = tracker.method(stream, 'write', ((chunk: unknown, ...args: unknown[]) => {
      if (typeof chunk === 'string') {
        captured[name].push(chunk)
        return true
      }
      return Reflect.apply(original, stream, [chunk, ...args]) as boolean
    }) as typeof stream.write)
    return () => patch.mock.restore()
  })
  return { captured, restore: () => restores.forEach((restore) => restore()) }
}

/**
 * Captures string writes to `process.stdout` and `process.stderr` until the
 * test finishes, at which point `node:test` restores them (also on failure).
 * The only place tests may patch the process streams.
 */
export function capture (t: TestContext): Captured {
  return install(t.mock).captured
}

/**
 * Like {@link capture}, but scoped to `fn`: the streams are restored as soon as
 * it settles, even if it throws. For helpers that have no `TestContext` in reach.
 */
export async function captureDuring (fn: () => unknown): Promise<Captured> {
  const { captured, restore } = install(mock)
  try {
    await fn()
  } finally {
    restore()
  }
  return captured
}

/** Builds in-memory `stdout`/`stderr` sinks to inject as command dependencies. */
export function captureOutput (): OutputSink {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  return {
    stdout: { chunks: stdoutChunks, write: (s) => { stdoutChunks.push(s); return true } },
    stderr: { chunks: stderrChunks, write: (s) => { stderrChunks.push(s); return true } },
  }
}
