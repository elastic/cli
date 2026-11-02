/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process'

/**
 * Callback for a resolver registered under a given name. Receives the raw
 * parameter string from inside `$(name:params)` and returns the resolved
 * value (either synchronously or as a promise).
 */
export type ResolverFn = (params: string) => string | Promise<string>

/**
 * Injectable dependencies for {@link resolveString} and
 * {@link resolveExpressions}. Each field defaults to the real process.
 */
export interface ResolverDeps {
  /** Runs `cmd` and the OS secret-store CLIs. Defaults to `child_process.execSync`. */
  execSync?: (command: string, options: ExecSyncOptionsWithStringEncoding) => string
  /** Selects which OS-specific resolvers may run. Defaults to `process.platform`. */
  platform?: string
  /** Extra resolvers, looked up before the built-ins. */
  resolvers?: ReadonlyMap<string, ResolverFn>
}

type Env = Required<Pick<ResolverDeps, 'execSync' | 'platform'>>
type BuiltinResolver = (params: string, env: Env) => string | Promise<string>

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
  fieldPath: string,
  deps: ResolverDeps = {}
): Promise<string> {
  if (!containsExpression(value)) return value

  const matches = [...value.matchAll(new RegExp(EXPRESSION_RE.source, 'g'))]
  if (matches.length === 0) return value

  const env: Env = { execSync: deps.execSync ?? execSync, platform: deps.platform ?? process.platform }
  let result = value
  for (const match of matches) {
    const full = match[0]
    const name = match[1]!
    const params = match[2]!
    const resolver: BuiltinResolver | undefined = deps.resolvers?.get(name) ?? RESOLVERS.get(name)
    if (resolver == null) {
      throw new Error(
        `Unknown resolver "${name}" in expression "${full}" at ${fieldPath}. ` +
        `Available resolvers: ${[...RESOLVERS.keys()].join(', ')}`
      )
    }
    const resolved = await resolver(params, env)
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
 */
export async function resolveExpressions (
  obj: unknown,
  path: string = '',
  deps: ResolverDeps = {}
): Promise<unknown> {
  if (typeof obj === 'string') {
    return resolveString(obj, path || '<root>', deps)
  }
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item, i) => resolveExpressions(item, `${path}[${i}]`, deps)))
  }
  if (obj !== null && typeof obj === 'object') {
    // Object.fromEntries defines own data properties, so a `__proto__` key
    // stays a plain key instead of rewriting the result's prototype.
    return Object.fromEntries(await Promise.all(
      Object.entries(obj).map(async ([key, value]) => {
        const fieldPath = path ? `${path}.${key}` : key
        return [key, await resolveExpressions(value, fieldPath, deps)] as const
      })
    ))
  }
  return obj
}

// ---------------------------------------------------------------------------
// Built-in resolvers
// ---------------------------------------------------------------------------

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
  let fd
  try {
    // O_NONBLOCK keeps open() from hanging on a FIFO; it is undefined on
    // Windows, where `| undefined` coerces to 0.
    fd = openSync(params, constants.O_RDONLY | constants.O_NONBLOCK)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read file "${params}": ${message}`, { cause: err })
  }
  try {
    // Checks run on the open fd, and the cap counts bytes actually read:
    // a path-based stat can be swapped before the read, and procfs files
    // report size 0 regardless of content.
    if (!fstatSync(fd).isFile()) {
      throw new Error(`Failed to read file "${params}": not a regular file`)
    }
    const buf = Buffer.alloc(MAX_FILE_SIZE + 1)
    let total = 0
    let n
    while (total < buf.length && (n = readSync(fd, buf, total, buf.length - total, null)) > 0) total += n
    if (total > MAX_FILE_SIZE) {
      throw new Error(`Failed to read file "${params}": file is too large (max ${MAX_FILE_SIZE} bytes)`)
    }
    return buf.toString('utf-8', 0, total).trimEnd()
  } finally {
    closeSync(fd)
  }
}

function envResolver (params: string): string {
  const value = process.env[params]
  if (value == null || value === '') {
    throw new Error(`Environment variable "${params}" is not set or is empty`)
  }
  return value
}

function cmdResolver (params: string, { execSync }: Env): string {
  try {
    return execSync(params, execOpts(10_000)).trimEnd()
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

function keychainResolver (params: string, { execSync, platform }: Env): string {
  if (platform !== 'darwin') {
    throw new Error(
      `The keychain resolver is only supported on macOS (current platform: ${platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'keychain')

  try {
    return execSync(
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

function secretServiceResolver (params: string, { execSync, platform }: Env): string {
  if (platform !== 'linux') {
    throw new Error(
      `The secret_service resolver is only supported on Linux (current platform: ${platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'secret_service')

  try {
    return execSync(
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

function passResolver (params: string, { execSync }: Env): string {
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
    output = execSync(
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

function credentialManagerResolver (params: string, { execSync, platform }: Env): string {
  if (platform !== 'win32') {
    throw new Error(
      `The credential_manager resolver is only supported on Windows (current platform: ${platform})`
    )
  }

  const { service, account } = parseServiceAccount(params, 'credential_manager')
  const target = `${service}/${account}`
  const expression = `(Get-StoredCredential -Target '${target.replace(/'/g, "''")}').GetNetworkCredential().Password`

  let result: string
  try {
    result = execSync(
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
// Resolver table
// ---------------------------------------------------------------------------

// A Map, not an object literal, so names like `constructor` or `__proto__`
// can't reach Object.prototype members.
const RESOLVERS = new Map<string, BuiltinResolver>([
  ['file', fileResolver],
  ['env', envResolver],
  ['cmd', cmdResolver],
  ['keychain', keychainResolver],
  ['secret_service', secretServiceResolver],
  ['pass', passResolver],
  ['credential_manager', credentialManagerResolver],
])
