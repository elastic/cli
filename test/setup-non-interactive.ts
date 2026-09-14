/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global test setup: force the confirmation guard onto its non-TTY,
 * fail-closed path for the whole run.
 *
 * With `--test-isolation=none` every test file shares one process and
 * inherits the real terminal's stdin. A destructive command test that does
 * not override the TTY seam would otherwise reach `promptConfirm()`, open a
 * readline on the interactive stdin, and block forever waiting for `y/N`
 * (e.g. `extension remove`). Under the previous per-file process isolation
 * each child had a non-TTY stdin, so this never surfaced.
 *
 * Tests that need the interactive path still override the seam locally via
 * `_testSetIsTTY(true)` and restore to this `false` default afterwards.
 */

import { _testSetIsTTY } from '../src/factory.ts'

_testSetIsTTY(false)

// Node 22 + isolation=none writes TAP as strings through process.stdout.write.
// Tests that capture string writes then see "# Subtest:" in JSON output.
// Node 24 writes the same frames as Buffers, which those tests already pass through.
const stdout = process.stdout
const realWrite = stdout.write.bind(stdout)
let inner: typeof stdout.write = realWrite

function isRunnerTap(chunk: unknown): boolean {
  return typeof chunk === 'string' &&
    /^\s*(?:# Subtest:|(?:not )?ok \d+ |# (?:fail|tests|pass|cancelled|skipped|todo)\b|\d+\.\.\d+| {2}(?:---|\.\.\.|duration_ms:|type: |error: |location: ))/.test(chunk)
}

function tapAwareWrite(
  chunk: unknown,
  encoding?: BufferEncoding | ((err?: Error | null) => void),
  cb?: (err?: Error | null) => void,
): boolean {
  if (isRunnerTap(chunk)) return realWrite(chunk as string, encoding as BufferEncoding, cb)
  return inner.call(stdout, chunk as never, encoding as never, cb as never)
}

Object.defineProperty(stdout, 'write', {
  configurable: true,
  get: () => tapAwareWrite,
  set(fn: typeof stdout.write) {
    const name = typeof fn === 'function' ? fn.name : ''
    inner = (typeof fn === 'function' && fn !== tapAwareWrite && name !== 'tapAwareWrite' && name !== 'bound tapAwareWrite')
      ? fn
      : realWrite
  },
})
