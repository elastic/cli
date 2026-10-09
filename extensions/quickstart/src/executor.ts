/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runs elastic CLI commands as child processes and parses their `--json` output.
 *
 * Ported from the in-tree MVP's executor with one change: the command is the
 * binary resolved by `cli-bin.ts` rather than a re-exec of the current process.
 * Every other reason for orchestrating by subprocess still holds. The command
 * factory owns validation, `--dry-run`, and error normalisation; `--wait` and
 * `--save-as` are registration-time wrappers; and the resolved-config store is
 * write-once per process, which a flow that creates a context mid-run cannot use.
 *
 * Security: `shell: false`, explicit args array, and never a secret in argv.
 */

import { spawn } from 'node:child_process'

/** Structured outcome of one CLI subprocess invocation. */
export interface CliResult {
  ok: boolean
  exitCode: number
  /** Parsed stdout JSON, when stdout contained valid JSON. */
  data?: unknown
  /** Structured error envelope parsed from stderr, when present. */
  error?: { code: string, message: string, status?: number }
  stderr: string
}

export interface RunCliOptions {
  /** Called for each line the child writes to stderr (spinner phase text). */
  onStderrLine?: (line: string) => void
  /** Timeout in ms; the child is killed when exceeded. Default: 10 minutes. */
  timeoutMs?: number
}

export type RunCli = (argv: readonly string[], opts?: RunCliOptions) => Promise<CliResult>

const DEFAULT_TIMEOUT_MS = 600_000
const SIGKILL_GRACE_MS = 5_000

/**
 * Extracts the factory's single-line `{"error":{...}}` envelope from stderr.
 * Scans from the end so warnings printed earlier do not shadow it.
 */
export function extractErrorEnvelope (stderr: string): CliResult['error'] | undefined {
  const lines = stderr.split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] as string).trim()
    if (!line.startsWith('{')) continue
    try {
      const parsed = JSON.parse(line) as {
        error?: { code?: unknown, message?: unknown, status_code?: unknown, body?: unknown }
      }
      const err = parsed.error
      if (err == null || typeof err.code !== 'string') continue
      const status = typeof err.status_code === 'number' ? err.status_code : undefined
      // ES transport errors carry status_code + body instead of message.
      const message = typeof err.message === 'string'
        ? err.message
        : err.body != null
          ? `${status != null ? `status ${status}: ` : ''}${JSON.stringify(err.body)}`
          : status != null ? `status ${status}` : err.code
      return { code: err.code, message, ...(status != null ? { status } : {}) }
    } catch {
      // not JSON; keep scanning
    }
  }
  return undefined
}

/**
 * Builds a {@link RunCli} bound to a resolved CLI binary.
 *
 * The returned function never rejects: timeouts and spawn failures come back as
 * a `CliResult` whose `error.code` is `timeout` / `spawn_error`, so callers have
 * a single failure path.
 */
export function createRunCli (cliPath: string): RunCli {
  return async function runCli (argv, opts = {}) {
    const child = spawn(cliPath, [...argv, '--json'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let stderrTail = ''

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderr += text
      if (opts.onStderrLine != null) {
        stderrTail += text
        let idx: number
        while ((idx = stderrTail.indexOf('\n')) !== -1) {
          const line = stderrTail.slice(0, idx).trim()
          stderrTail = stderrTail.slice(idx + 1)
          if (line.length > 0) opts.onStderrLine(line)
        }
      }
    })

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const outcome = await new Promise<{ exitCode: number, error?: CliResult['error'] }>((resolve) => {
      const timer = setTimeout(() => {
        // Resolve with the output collected so far; escalate to SIGKILL (unref'd,
        // so it never holds the event loop) if SIGTERM is ignored.
        child.kill('SIGTERM')
        setTimeout(() => { child.kill('SIGKILL') }, SIGKILL_GRACE_MS).unref()
        resolve({
          exitCode: 1,
          error: { code: 'timeout', message: `elastic ${argv.join(' ')} timed out after ${Math.round(timeoutMs / 1000)}s` },
        })
      }, timeoutMs)
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          exitCode: 1,
          error: { code: 'spawn_error', message: `failed to spawn elastic ${argv.join(' ')}: ${err.message}` },
        })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ exitCode: code ?? 1 })
      })
    })

    const result: CliResult = {
      ok: outcome.exitCode === 0 && outcome.error == null,
      exitCode: outcome.exitCode,
      stderr,
    }
    if (outcome.error != null) result.error = outcome.error

    const trimmed = stdout.trim()
    if (trimmed.length > 0) {
      try {
        result.data = JSON.parse(trimmed)
      } catch {
        // non-JSON stdout; leave data unset
      }
    }
    if (!result.ok && result.error == null) {
      const envelope = extractErrorEnvelope(stderr)
      if (envelope != null) result.error = envelope
    }
    return result
  }
}
