/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error envelope and exit codes.
 *
 * The CLI's command factory normally owns this. Extensions are spawned with
 * inherited stdio and no wrapper, so the envelope the agent contract promises
 * -- `{"error": {"code", "message"}}` on stderr, non-zero exit -- is produced
 * here instead.
 */

/** A failure with a stable machine-readable code. */
export class QuickstartError extends Error {
  readonly code: string
  readonly exitCode: number
  /** Actionable commands or steps rendered under the message for humans. */
  readonly nextSteps: readonly string[]

  constructor (code: string, message: string, nextSteps: readonly string[] = [], exitCode = 1) {
    super(message)
    this.name = 'QuickstartError'
    this.code = code
    this.nextSteps = nextSteps
    this.exitCode = exitCode
  }
}

/** Narrows an unknown throwable to the envelope fields, so no failure path is uncoded. */
export function toEnvelope (err: unknown): { code: string, message: string } {
  if (err instanceof QuickstartError) return { code: err.code, message: err.message }
  return { code: 'internal_error', message: err instanceof Error ? err.message : String(err) }
}

/**
 * Writes the single-line JSON envelope the CLI's own executor scans for, then
 * the human-readable next steps. Returns the exit code the caller should use.
 */
export function reportError (err: unknown, stderr: NodeJS.WritableStream): number {
  const envelope = toEnvelope(err)
  stderr.write(JSON.stringify({ error: envelope }) + '\n')
  if (err instanceof QuickstartError && err.nextSteps.length > 0) {
    stderr.write(`\nNext steps:\n${err.nextSteps.map((s) => `  - ${s}`).join('\n')}\n`)
  }
  return err instanceof QuickstartError ? err.exitCode : 1
}
