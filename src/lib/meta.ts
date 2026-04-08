/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cliVersion: string = (require('../../package.json') as { version: string }).version
const transportVersion: string = (require('@elastic/transport/package.json') as { version: string }).version

/**
 * Returns HTTP headers that uniquely identify CLI traffic.
 *
 * - `user-agent` — human-readable identifier: CLI name/version, OS, and Node.js version
 * - `x-elastic-client-meta` — compact, machine-parseable key=value pairs for telemetry
 *
 * These override the generic defaults set by `@elastic/transport`.
 */
export function clientHeaders(): { 'user-agent': string; 'x-elastic-client-meta': string } {
  const userAgent = `elastic-cli/${cliVersion} (${os.platform()} ${os.arch()}; Node.js ${process.version})`
  const clientMeta = `ec=${cliVersion},js=${process.versions.node},t=${transportVersion}`
  return { 'user-agent': userAgent, 'x-elastic-client-meta': clientMeta }
}
