/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mode detection, unchanged from the in-tree MVP.
 *
 * Interactive mode requires BOTH stdin and stderr to be TTYs: stdin is the
 * binding constraint (the prompt library needs raw mode to read keys), and
 * stderr governs whether prompt UI can be drawn at all. `--json` forces agent
 * mode even at a TTY.
 *
 * Coding agents often allocate a PTY, so TTY detection alone is not enough.
 * Agents must pass `--json` explicitly. That is the published contract.
 * Extension dispatch inherits stdio, so these signals survive the hop.
 */

export type QuickstartMode = 'interactive' | 'agent'

/** TTY facts about the process streams, injectable for tests. */
export interface StreamInfo {
  stdinIsTTY: boolean
  stderrIsTTY: boolean
}

/** Reads the real process streams. */
export function processStreamInfo (): StreamInfo {
  return {
    stdinIsTTY: process.stdin.isTTY === true,
    stderrIsTTY: process.stderr.isTTY === true,
  }
}

/** Decides the rendering mode from the `--json` flag and stream TTY-ness. */
export function detectMode (jsonFlag: boolean, streams: StreamInfo = processStreamInfo()): QuickstartMode {
  if (jsonFlag) return 'agent'
  return streams.stdinIsTTY && streams.stderrIsTTY ? 'interactive' : 'agent'
}
