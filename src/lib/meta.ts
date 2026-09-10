/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os'
import { getResolvedConfig } from '../config/store.ts'

// x-release-please-start-version
const cliVersion = '0.5.0'
// x-release-please-end

/**
 * Converts a semver string to the format required by the x-elastic-client-meta spec.
 * Pre-release labels (alpha, beta, rc, etc.) are replaced with a `p` suffix.
 */
export function toMetaVersion(version: string): string {
  return version.replace(/-.*$/, 'p')
}

const _metaVersion = toMetaVersion(cliVersion)
const _userAgent = `elastic-cli/${cliVersion} (${os.platform()} ${os.arch()}; Node.js ${process.version})`
const _clientMeta = `et=${_metaVersion},js=${process.versions.node},t=${_metaVersion}`

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
 */
export function clientHeaders(): { 'user-agent': string; 'x-elastic-client-meta'?: string } {
  if (!telemetryEnabled()) return { 'user-agent': _userAgent }
  return { 'user-agent': _userAgent, 'x-elastic-client-meta': _clientMeta }
}
