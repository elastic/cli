/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds a minimal environment for extension subprocesses, passing only the
 * variables needed for basic process execution. Ambient secrets (AWS keys,
 * GITHUB_TOKEN, NPM_TOKEN, etc.) present in the parent process are excluded.
 */

const KEEP_VARS = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM',
  'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TZ',
  // Windows required vars
  'SystemRoot', 'ComSpec', 'PATHEXT', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA',
])

const KEEP_PREFIXES = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_',
]

export function buildExtensionEnvironment (env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(env)) {
    if (val == null) continue
    const upper = key.toUpperCase()
    if (KEEP_VARS.has(key) || KEEP_VARS.has(upper) || KEEP_PREFIXES.some(p => upper.startsWith(p))) {
      result[key] = val
    }
  }
  return result
}
