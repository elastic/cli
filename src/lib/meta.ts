/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os'
import { getResolvedConfig } from '../config/store.ts'
import { detectAgent, AGENT_SHORT_CODES, type Detection, type KnownAgent } from '@elastic/agent-env'

// x-release-please-start-version
const cliVersion = '0.6.0'
// x-release-please-end

/**
 * Converts a semver string to the format required by the x-elastic-client-meta spec.
 * Pre-release labels (alpha, beta, rc, etc.) are replaced with a `p` suffix.
 */
export function toMetaVersion(version: string): string {
  return version.replace(/-.*$/, 'p')
}

const _metaVersion = toMetaVersion(cliVersion)
const _userAgentPrefix = `elastic-cli/${cliVersion} (${os.platform()} ${os.arch()}; Node.js ${process.version}`

let _detectionCache: ReturnType<typeof detectAgent> | undefined

/**
 * Memoized agent detection. Invoked only when telemetry is enabled so that
 * opted-out users never trigger `detectAgent` at all.
 */
function detection(): Detection | null {
  if (_detectionCache === undefined) _detectionCache = detectAgent()
  return _detectionCache
}

/** Test-only: clears the memoized detection so later env changes take effect. */
export function _testResetDetection(): void {
  _detectionCache = undefined
}

/** Derives the `vendor/model` (or `model`) user-agent segment from a detection result. */
function llmSegmentOf(result: Detection | null): string {
  if (result == null || !result.llm) return ''
  const { model, vendor } = result.llm
  return vendor ? `${vendor}/${model}` : model
}

/** Derives the compact `,ag=<code>` meta segment from a detection result. */
function agentMetaOf(result: Detection | null): string {
  if (result == null) return ''
  const { agent } = result
  if (!Object.hasOwn(AGENT_SHORT_CODES, agent)) return ''
  return `,ag=${AGENT_SHORT_CODES[agent as KnownAgent]}`
}

/**
 * Detects the active LLM and returns `vendor/model` (or just `model`) for use
 * in the user-agent string, or `''` when no LLM is reported by the agent harness.
 */
export function llmUserAgentSegment(env: NodeJS.ProcessEnv = process.env): string {
  return llmSegmentOf(detectAgent(0.95, env))
}

/**
 * Detects the spawning agent harness and returns its compact `,ag=<code>`
 * meta segment, or `''` when no agent is detected at the default 0.95
 * confidence threshold or the agent has no short code (e.g. an arbitrary
 * `AI_AGENT`/`AGENT` opt-in value).
 */
export function agentMetaSegment(env: NodeJS.ProcessEnv = process.env): string {
  return agentMetaOf(detectAgent(0.95, env))
}

/**
 * Resolves whether the telemetry header should be sent.
 *
 * Precedence: `ELASTIC_CLI_TELEMETRY` env var (when set and non-empty) overrides the
 * config `telemetry` field, which in turn defaults to enabled (opt-out). Falsey env
 * values (`false`, `0`, `no`, `off`, case-insensitive) disable; any other value enables.
 */
function telemetryEnabled(): boolean {
  const env = process.env.ELASTIC_CLI_TELEMETRY
  if (env != null && env.trim() !== '') return !/^(false|0|no|off)$/i.test(env.trim())
  return getResolvedConfig()?.telemetry !== false
}

/**
 * Returns HTTP headers that uniquely identify CLI traffic.
 *
 * - `user-agent` — human-readable identifier: CLI name/version, OS, and Node.js version
 * - `x-elastic-client-meta` — structured key=value pairs per the Elastic client-meta spec:
 *   service key (`et`), language key (`js`), transport key (`t`).
 *   Per spec, when there is no separate transport library `t` equals the client version.
 *   An `ag=<code>` pair is appended when a spawning agent harness is detected
 *   (see `@elastic/agent-env`), attributing the traffic to that agent.
 */
export function clientHeaders(): { 'user-agent': string; 'x-elastic-client-meta'?: string } {
  if (!telemetryEnabled()) return { 'user-agent': `${_userAgentPrefix})` }
  const result = detection()
  const llmSegment = llmSegmentOf(result)
  const userAgent = `${_userAgentPrefix}${llmSegment ? `; ${llmSegment}` : ''})`
  const clientMeta = `et=${_metaVersion},js=${process.versions.node},t=${_metaVersion}${agentMetaOf(result)}`
  return { 'user-agent': userAgent, 'x-elastic-client-meta': clientMeta }
}
