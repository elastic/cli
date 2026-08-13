/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds a minimal environment for extension subprocesses, passing only the
 * variables needed for basic process execution. Ambient secrets (AWS keys,
 * GITHUB_TOKEN, NPM_TOKEN, etc.) present in the parent process are excluded.
 */

// Stored uppercase; buildExtensionEnvironment() compares against key.toUpperCase(),
// so any casing of a listed name is kept (handles Windows env var casing, e.g.
// SystemRoot, and incidentally lowercase POSIX conventions like http_proxy).
const KEEP_VARS = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM',
  'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TZ',
  // Windows required vars
  'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS',
])

// Uppercase prefixes — compared against key.toUpperCase(). Only genuine
// multi-variable prefixes belong here; single var names go in KEEP_VARS
// so startsWith() can't accidentally match a longer, unrelated var.
const KEEP_PREFIXES = [
  'SSL_CERT_',
]

export function buildExtensionEnvironment (env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(env)) {
    if (val == null) continue
    const upper = key.toUpperCase()
    if (KEEP_VARS.has(upper) || KEEP_PREFIXES.some(p => upper.startsWith(p))) {
      result[key] = val
    }
  }
  return result
}
