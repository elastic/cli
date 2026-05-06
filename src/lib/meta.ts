/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cliVersion: string = (require('../../package.json') as { version: string }).version

/**
 * Converts a semver string to the format required by the x-elastic-client-meta spec.
 * Pre-release labels (alpha, beta, rc, etc.) are replaced with a `p` suffix.
 */
export function toMetaVersion(version: string): string {
  return version.replace(/-.*$/, 'p')
}

const _metaVersion = toMetaVersion(cliVersion)
const _clientHeaders = {
  'user-agent': `elastic-cli/${cliVersion} (${os.platform()} ${os.arch()}; Node.js ${process.version})`,
  'x-elastic-client-meta': `et=${_metaVersion},js=${process.versions.node},t=${_metaVersion}`,
}

/**
 * Returns HTTP headers that uniquely identify CLI traffic.
 *
 * - `user-agent` — human-readable identifier: CLI name/version, OS, and Node.js version
 * - `x-elastic-client-meta` — structured key=value pairs per the Elastic client-meta spec:
 *   service key (`et`), language key (`js`), transport key (`t`).
 *   Per spec, when there is no separate transport library `t` equals the client version.
 */
export function clientHeaders(): { 'user-agent': string; 'x-elastic-client-meta': string } {
  return _clientHeaders
}
