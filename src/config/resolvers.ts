/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, statSync } from 'node:fs'
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process'

export type ResolverFn = (params: string) => string | Promise<string>

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ResolverFn>()

export function registerResolver (name: string, fn: ResolverFn): void {
  registry.set(name, fn)
}

export function getResolver (name: string): ResolverFn | undefined {
  return registry.get(name)
}

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

const EXPRESSION_RE = /\$\(([a-z_][a-z0-9_]*):([^)]+)\)/

export function containsExpression (value: string): boolean {
  return value.includes('$(')
}

export async function resolveString (
  value: string,
  fieldPath: string
): Promise<string> {
  if (!containsExpression(value)) return value

  const matches = [...value.matchAll(new RegExp(EXPRESSION_RE.source, 'g'))]
  if (matches.length === 0) return value

  let result = value
  for (const match of matches) {
    const full = match[0]
    const name = match[1]!
    const params = match[2]!
    const resolver = getResolver(name)
    if (resolver == null) {
      throw new Error(
        `Unknown resolver "${name}" in expression "${full}" at ${fieldPath}. ` +
        `Available resolvers: ${[...registry.keys()].join(', ')}`
      )
    }
    const resolved = await resolver(params)
    result = result.replaceAll(full, resolved)
  }

  return result
}

// ---------------------------------------------------------------------------
// Deep object walk
// ---------------------------------------------------------------------------

export async function resolveExpressions (
  obj: unknown,
  path: string = ''
): Promise<unknown> {
  if (typeof obj === 'string') {
    return resolveString(obj, path || '<root>')
  }
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item, i) => resolveExpressions(item, `${path}[${i}]`)))
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === '__proto__' || key === 'constructor') continue
      const fieldPath = path ? `${path}.${key}` : key
      result[key] = await resolveExpressions(value, fieldPath)
    }
    return result
  }
  return obj
}

// ---------------------------------------------------------------------------
// Built-in resolvers
// ---------------------------------------------------------------------------

let _execSync: typeof execSync = execSync
let _platform: string = process.platform

function execOpts (timeoutMs: number): ExecSyncOptionsWithStringEncoding {
  return { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
}

function shellEscape (value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

const MAX_FILE_SIZE = 64 * 1024 // 64 KB

function fileResolver (params: string): string {
  let stat
  try {
    stat = statSync(params)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read file "${params}": ${message}`, { cause: err })
  }
  if (!stat.isFile()) {
    throw new Error(`Failed to read file "${params}": not a regular file`)
  }
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`Failed to read file "${params}": file is ${stat.size} bytes (max ${MAX_FILE_SIZE})`)
  }
  return readFileSync(params, 'utf-8').trimEnd()
}

function envResolver (params: string): string {
  const value = process.env[params]
  if (value == null || value === '') {
    throw new Error(`Environment variable "${params}" is not set or is empty`)
  }
  return value
}

function cmdResolver (params: string): string {
  try {
    return _execSync(params, execOpts(10_000)).trimEnd()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Command failed: ${params}\n${message}`, { cause: err })
  }
}

function keychainResolver (params: string): string {
  if (_platform !== 'darwin') {
    throw new Error(
      `The keychain resolver is only supported on macOS (current platform: ${_platform})`
    )
  }

  if (!/^[\x20-\x7e]+$/.test(params)) {
    throw new Error(
      `Invalid keychain parameter "${params}": contains non-printable characters`
    )
  }

  const slashIndex = params.indexOf('/')
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === params.length - 1) {
    throw new Error(
      `Invalid keychain parameter "${params}": expected format "service/account" ` +
      `(e.g., "elastic-cli/api-key")`
    )
  }

  const service = params.slice(0, slashIndex)
  const account = params.slice(slashIndex + 1)

  try {
    return _execSync(
      `security find-generic-password -s ${shellEscape(service)} -a ${shellEscape(account)} -w`,
      execOpts(5_000)
    ).trimEnd()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Keychain lookup failed for service="${service}", account="${account}": ${message}`,
      { cause: err }
    )
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function registerBuiltins (): void {
  registerResolver('file', fileResolver)
  registerResolver('env', envResolver)
  registerResolver('cmd', cmdResolver)
  registerResolver('keychain', keychainResolver)
}

registerBuiltins()

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

export function _testResetResolvers (): void {
  registry.clear()
  registerBuiltins()
}

export function _testSetExecSync (fn: typeof execSync): () => void {
  const prev = _execSync
  _execSync = fn
  return () => { _execSync = prev }
}

export function _testSetPlatform (p: string): () => void {
  const prev = _platform
  _platform = p
  return () => { _platform = prev }
}
