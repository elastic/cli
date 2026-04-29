/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, statSync } from 'node:fs'
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process'

/**
 * Callback for a resolver registered under a given name. Receives the raw
 * parameter string from inside `$(name:params)` and returns the resolved
 * value (either synchronously or as a promise).
 */
export type ResolverFn = (params: string) => string | Promise<string>

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ResolverFn>()

/**
 * Registers a resolver under {@link name} so that expressions of the form
 * `$(name:params)` are routed to {@link fn}. Overwrites any previously
 * registered resolver with the same name.
 */
export function registerResolver (name: string, fn: ResolverFn): void {
  registry.set(name, fn)
}

/**
 * Looks up a resolver by name. Returns `undefined` if no resolver has been
 * registered under that name.
 */
export function getResolver (name: string): ResolverFn | undefined {
  return registry.get(name)
}

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

const EXPRESSION_RE = /\$\(([a-z_][a-z0-9_]*):([^)]+)\)/

/**
 * Cheap check for whether {@link value} might contain a resolver expression.
 * Used as a fast path to skip regex matching on plain strings.
 */
export function containsExpression (value: string): boolean {
  return value.includes('$(')
}

/**
 * Resolves every `$(name:params)` expression in {@link value} and returns the
 * combined result. {@link fieldPath} is included in error messages to help
 * locate the offending config key.
 *
 * @throws if any expression references an unknown resolver or if a resolver
 *         callback itself throws.
 */
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

/**
 * Recursively walks {@link obj} (objects, arrays, primitives) and replaces
 * every string containing resolver expressions with its resolved value.
 * Non-string values are returned unchanged. {@link path} is used internally
 * to build dotted field paths for error messages; callers normally omit it.
 *
 * Prototype-polluting keys (`__proto__`, `constructor`) are skipped.
 */
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

function psEncodedCommand (expression: string): string {
  const utf16le = Buffer.from(expression, 'utf16le')
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${utf16le.toString('base64')}`
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

const PRINTABLE_ASCII_RE = /^[\x20-\x7e]+$/

function parseServiceAccount (params: string, resolverName: string): { service: string; account: string } {
  if (!PRINTABLE_ASCII_RE.test(params)) {
    throw new Error(
      `Invalid ${resolverName} parameter "${params}": contains non-printable characters`
    )
  }

  const slashIndex = params.indexOf('/')
  if (slashIndex === -1 || slashIndex === 0 || slashIndex === params.length - 1) {
    throw new Error(
      `Invalid ${resolverName} parameter "${params}": expected format "service/account" ` +
      `(e.g., "elastic-cli/api-key")`
    )
  }

  return { service: params.slice(0, slashIndex), account: params.slice(slashIndex + 1) }
}

function keychainResolver (params: string): string {
  if (_platform !== 'darwin') {
    throw new Error(
      `The keychain resolver is only supported on macOS (current platform: ${_platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'keychain')

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

function secretServiceResolver (params: string): string {
  if (_platform !== 'linux') {
    throw new Error(
      `The secret_service resolver is only supported on Linux (current platform: ${_platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'secret_service')

  try {
    return _execSync(
      `secret-tool lookup service ${shellEscape(service)} account ${shellEscape(account)}`,
      execOpts(5_000)
    ).trimEnd()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Secret Service lookup failed for service="${service}", account="${account}": ${message}`,
      { cause: err }
    )
  }
}

function passResolver (params: string): string {
  const path = params.trim()
  if (path === '') {
    throw new Error('Invalid pass parameter: path must not be empty')
  }
  if (!PRINTABLE_ASCII_RE.test(path)) {
    throw new Error(
      `Invalid pass parameter "${path}": contains non-printable characters`
    )
  }

  let output: string
  try {
    output = _execSync(
      `pass show ${shellEscape(path)}`,
      execOpts(5_000)
    ).trimEnd()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `pass lookup failed for "${path}": ${message}`,
      { cause: err }
    )
  }

  const nl = output.indexOf('\n')
  const firstLine = nl === -1 ? output : output.slice(0, nl)
  if (firstLine === '') {
    throw new Error(`pass returned empty output for "${path}"`)
  }
  return firstLine
}

function credentialManagerResolver (params: string): string {
  if (_platform !== 'win32') {
    throw new Error(
      `The credential_manager resolver is only supported on Windows (current platform: ${_platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'credential_manager')
  const target = `${service}/${account}`
  const expression = `(Get-StoredCredential -Target '${target.replace(/'/g, "''")}').GetNetworkCredential().Password`

  let result: string
  try {
    result = _execSync(
      psEncodedCommand(expression),
      execOpts(10_000)
    ).trimEnd()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Credential Manager lookup failed for service="${service}", account="${account}": ${message}`,
      { cause: err }
    )
  }

  if (result === '') {
    throw new Error(
      `Credential Manager returned empty password for service="${service}", account="${account}"`
    )
  }
  return result
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function registerBuiltins (): void {
  registerResolver('file', fileResolver)
  registerResolver('env', envResolver)
  registerResolver('cmd', cmdResolver)
  registerResolver('keychain', keychainResolver)
  registerResolver('secret_service', secretServiceResolver)
  registerResolver('pass', passResolver)
  registerResolver('credential_manager', credentialManagerResolver)
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
