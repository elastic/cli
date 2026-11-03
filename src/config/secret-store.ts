/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OS-level secret storage abstraction.
 *
 * Mirrors the read-side resolvers in {@link ./resolvers.ts} but for writes.
 * Implementations shell out to platform-native tools:
 *   - macOS:   `security` (Keychain Access)
 *   - Linux:   `secret-tool` (libsecret)
 *   - pass:    `pass` (the standard unix password manager)
 *   - Windows: PowerShell CredentialManager module
 *
 * Each implementation exposes `put` / `delete` / `isAvailable` and produces a
 * resolver-expression string that, when placed in the YAML config, will be
 * read back by the corresponding resolver.
 */

import {
  execSync,
  spawnSync,
  type ExecSyncOptionsWithStringEncoding,
  type SpawnSyncOptionsWithStringEncoding,
} from 'node:child_process'

/** Distinguishes between the supported secret-store implementations. */
export type SecretStoreKind =
  | 'keychain'
  | 'secret_service'
  | 'pass'
  | 'credential_manager'
  | 'none'

/**
 * Writeable secret store. Read is delegated to the matching resolver in
 * `resolvers.ts`; `resolverExpr` produces the `$(...)` string to place in YAML.
 */
export interface SecretStore {
  kind: SecretStoreKind
  /** Cheap probe for the backing tool's presence. Cached per-instance. */
  isAvailable(): Promise<boolean>
  /**
   * Stores `secret` under `(service, account)`. Overwrites silently on
   * existing entries (policy lives one layer up in the command handlers).
   */
  put(service: string, account: string, secret: string): Promise<void>
  /**
   * Removes the entry. Idempotent: absent entries succeed.
   */
  delete(service: string, account: string): Promise<void>
  /** YAML expression string (e.g. `$(keychain:elastic-cli/prod:es.api_key)`). */
  resolverExpr(service: string, account: string): string
}

const PRINTABLE_ASCII_RE = /^[\x20-\x7e]+$/

function validateServiceAccount (service: string, account: string, kind: SecretStoreKind): void {
  for (const [field, value] of [['service', service], ['account', account]] as const) {
    if (value.length === 0) {
      throw new Error(`Invalid ${kind} ${field}: must not be empty`)
    }
    if (!PRINTABLE_ASCII_RE.test(value)) {
      throw new Error(
        `Invalid ${kind} ${field} "${value}": contains non-printable characters`
      )
    }
    if (value.includes('/')) {
      throw new Error(
        `Invalid ${kind} ${field} "${value}": must not contain "/"`
      )
    }
  }
}

function execOpts (timeoutMs: number, input?: string): ExecSyncOptionsWithStringEncoding & { input?: string } {
  const opts: ExecSyncOptionsWithStringEncoding & { input?: string } = {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  }
  if (input !== undefined) opts.input = input
  return opts
}

function shellEscape (value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

function psEncodedCommand (expression: string): string {
  const utf16le = Buffer.from(expression, 'utf16le')
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${utf16le.toString('base64')}`
}

function redactSecret (message: string, secret: string): string {
  return secret.length === 0 ? message : message.split(secret).join('[redacted]')
}

/**
 * `security -w` with no password prompts (enter + retype). If the process has
 * a controlling TTY it reads `/dev/tty` and ignores stdin. Drop the session
 * with `setsid` so `/dev/tty` fails, then feed both prompt lines on stdin.
 * The secret stays off argv (`ps` / `execSync` error text).
 */
const SETSID_PERL = '/usr/bin/perl'
const SETSID_SCRIPT = 'use POSIX; POSIX::setsid(); exec { $ARGV[0] } @ARGV;'

function spawnOpts (timeoutMs: number, input?: string): SpawnSyncOptionsWithStringEncoding & { input?: string } {
  const opts: SpawnSyncOptionsWithStringEncoding & { input?: string } = {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  }
  if (input !== undefined) opts.input = input
  return opts
}

/**
 * Injectable process hooks for {@link getSecretStore} and the store classes.
 * Each field defaults to the real process.
 */
export interface SecretStoreDeps {
  execSync?: typeof execSync
  spawnSync?: typeof spawnSync
  /** Selects the candidate stores. Defaults to `process.platform`. */
  platform?: string
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

abstract class ShellSecretStore implements SecretStore {
  abstract kind: SecretStoreKind
  private availability: boolean | undefined
  protected readonly execSync: typeof execSync
  protected readonly spawnSync: typeof spawnSync

  constructor (deps: SecretStoreDeps = {}) {
    this.execSync = deps.execSync ?? execSync
    this.spawnSync = deps.spawnSync ?? spawnSync
  }

  async isAvailable (): Promise<boolean> {
    if (this.availability !== undefined) return this.availability
    try {
      this.probe()
      this.availability = true
    } catch {
      this.availability = false
    }
    return this.availability
  }

  protected abstract probe(): void
  abstract put(service: string, account: string, secret: string): Promise<void>
  abstract delete(service: string, account: string): Promise<void>
  abstract resolverExpr(service: string, account: string): string
}

class MacOSKeychainStore extends ShellSecretStore {
  kind = 'keychain' as const

  protected probe (): void {
    this.execSync('security -h', execOpts(2_000))
  }

  async put (service: string, account: string, secret: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    try {
      const result = this.spawnSync(
        SETSID_PERL,
        [
          '-e', SETSID_SCRIPT,
          'security', 'add-generic-password', '-U',
          '-s', service,
          '-a', account,
          '-w',
        ],
        spawnOpts(5_000, `${secret}\n${secret}\n`)
      )
      if (result.error != null) throw result.error
      if (result.status !== 0) {
        const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim()
        throw new Error(detail)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Keychain write failed for service="${service}", account="${account}": ${redactSecret(message, secret)}`,
        { cause: err }
      )
    }
  }

  async delete (service: string, account: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    try {
      this.execSync(
        `security delete-generic-password -s ${shellEscape(service)} -a ${shellEscape(account)}`,
        execOpts(5_000)
      )
    } catch {
      // Idempotent: absent entries exit non-zero but are not an error.
    }
  }

  resolverExpr (service: string, account: string): string {
    validateServiceAccount(service, account, this.kind)
    return `$(keychain:${service}/${account})`
  }
}

class LinuxSecretServiceStore extends ShellSecretStore {
  kind = 'secret_service' as const

  protected probe (): void {
    this.execSync('secret-tool --version', execOpts(2_000))
  }

  async put (service: string, account: string, secret: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    try {
      this.execSync(
        `secret-tool store --label=${shellEscape(`elastic-cli:${service}:${account}`)} service ${shellEscape(service)} account ${shellEscape(account)}`,
        execOpts(5_000, secret)
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Secret Service write failed for service="${service}", account="${account}": ${message}`, { cause: err })
    }
  }

  async delete (service: string, account: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    try {
      this.execSync(
        `secret-tool clear service ${shellEscape(service)} account ${shellEscape(account)}`,
        execOpts(5_000)
      )
    } catch {
      // Idempotent.
    }
  }

  resolverExpr (service: string, account: string): string {
    validateServiceAccount(service, account, this.kind)
    return `$(secret_service:${service}/${account})`
  }
}

class PassStore extends ShellSecretStore {
  kind = 'pass' as const

  protected probe (): void {
    this.execSync('pass version', execOpts(2_000))
  }

  private passPath (service: string, account: string): string {
    return `${service}/${account}`
  }

  async put (service: string, account: string, secret: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    const path = this.passPath(service, account)
    try {
      // `pass insert -m -f <path>` reads a multi-line password from stdin and
      // overwrites any existing entry without prompting.
      this.execSync(`pass insert -m -f ${shellEscape(path)}`, execOpts(5_000, secret + '\n'))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`pass write failed for "${path}": ${message}`, { cause: err })
    }
  }

  async delete (service: string, account: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    const path = this.passPath(service, account)
    try {
      this.execSync(`pass rm -f ${shellEscape(path)}`, execOpts(5_000))
    } catch {
      // Idempotent.
    }
  }

  resolverExpr (service: string, account: string): string {
    validateServiceAccount(service, account, this.kind)
    return `$(pass:${this.passPath(service, account)})`
  }
}

class WindowsCredentialManagerStore extends ShellSecretStore {
  kind = 'credential_manager' as const

  protected probe (): void {
    // CredentialManager is a community PowerShell module. Probe for
    // `Get-Command New-StoredCredential` — cheaper than loading the module.
    this.execSync(
      psEncodedCommand('if (-not (Get-Command New-StoredCredential -ErrorAction SilentlyContinue)) { exit 1 }'),
      execOpts(5_000)
    )
  }

  private target (service: string, account: string): string {
    return `${service}/${account}`
  }

  async put (service: string, account: string, secret: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    const target = this.target(service, account).replace(/'/g, "''")
    const user = account.replace(/'/g, "''")
    const expression =
      `$secure = ConvertTo-SecureString -String ([Console]::In.ReadToEnd().TrimEnd(@([char]"\`n", [char]"\`r"))) -AsPlainText -Force; ` +
      `New-StoredCredential -Target '${target}' -UserName '${user}' -SecurePassword $secure -Persist LocalMachine | Out-Null`
    try {
      this.execSync(psEncodedCommand(expression), execOpts(10_000, secret))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Credential Manager write failed for service="${service}", account="${account}": ${message}`, { cause: err })
    }
  }

  async delete (service: string, account: string): Promise<void> {
    validateServiceAccount(service, account, this.kind)
    const target = this.target(service, account).replace(/'/g, "''")
    try {
      this.execSync(
        psEncodedCommand(`Remove-StoredCredential -Target '${target}' -ErrorAction SilentlyContinue`),
        execOpts(10_000)
      )
    } catch {
      // Idempotent.
    }
  }

  resolverExpr (service: string, account: string): string {
    validateServiceAccount(service, account, this.kind)
    return `$(credential_manager:${this.target(service, account)})`
  }
}

class NoopStore implements SecretStore {
  kind = 'none' as const
  async isAvailable (): Promise<boolean> { return false }
  async put (): Promise<void> {
    throw new Error('No OS secret store is available on this system. Re-run with --inline-secrets to write credentials to the config file (they will be stored in plain text).')
  }
  async delete (): Promise<void> { /* nothing to delete */ }
  resolverExpr (): string {
    throw new Error('No OS secret store is available: cannot produce a resolver expression')
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns the first available secret store for the current platform.
 *
 * Probe order:
 *   - darwin: Keychain
 *   - linux:  secret-tool → pass
 *   - win32:  CredentialManager
 *   - other:  pass (best effort)
 *
 * Falls back to a {@link NoopStore} if none are available.
 */
export async function getSecretStore (deps: SecretStoreDeps = {}): Promise<SecretStore> {
  const candidates = candidatesForPlatform(deps.platform ?? process.platform, deps)
  for (const store of candidates) {
    if (await store.isAvailable()) return store
  }
  return new NoopStore()
}

function candidatesForPlatform (platform: string, deps: SecretStoreDeps): SecretStore[] {
  switch (platform) {
    case 'darwin':
      return [new MacOSKeychainStore(deps)]
    case 'linux':
      return [new LinuxSecretServiceStore(deps), new PassStore(deps)]
    case 'win32':
      return [new WindowsCredentialManagerStore(deps)]
    default:
      return [new PassStore(deps)]
  }
}

// ---------------------------------------------------------------------------
// Exports for tests
// ---------------------------------------------------------------------------

export const _testStores = {
  MacOSKeychainStore,
  LinuxSecretServiceStore,
  PassStore,
  WindowsCredentialManagerStore,
  NoopStore,
}
