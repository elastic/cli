/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension install and remove logic.
 *
 * Supported source prefixes:
 *   github:owner/repo   -- git clone from GitHub; builds if package.json present
 *   owner/repo          -- bare shorthand, treated as github:
 *   npm:package-name    -- npm install into a local prefix dir
 *
 * Naming convention (mirrors the RFC):
 *   Extension repos/packages should be named `elastic-<name>`.
 *   The `elastic-` prefix is stripped to derive the short CLI name.
 *   e.g. `elastic/elastic-local` → name `local`, invoked as `elastic local`.
 *   If the repo/package is not prefixed with `elastic-`, the full name is used.
 *
 * Security:
 *   All child processes are spawned with shell: false and an explicit args array.
 *   The derived entrypoint is validated to sit within the install directory.
 */

import { access, constants, mkdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, isAbsolute, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { upsertExtension, removeExtension as removeFromStore } from './store.ts'
import type { InstalledExtension } from './store.ts'

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

let _extensionsDir: string | undefined

/** @internal Override the base extensions directory. Pass undefined to restore default. */
export function _testSetExtensionsDir (dir: string | undefined): void {
  _extensionsDir = dir
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionsDir (): string {
  return _extensionsDir ?? join(homedir(), '.elastic', 'extensions')
}

/** Strip the `elastic-` prefix from a repo/package base name, if present. */
function deriveName (base: string): string {
  return base.startsWith('elastic-') ? base.slice('elastic-'.length) : base
}

/** Valid extension name pattern (same as store). */
const SAFE_NAME_RE = /^[a-z0-9-]+$/

function assertSafeName (name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `Derived extension name "${name}" contains invalid characters (allowed: a-z, 0-9, hyphen). ` +
      'Rename the repository or package to use only lowercase letters, digits, and hyphens.'
    )
  }
}

interface ParsedSource {
  type: 'github' | 'npm'
  /** Full package name for npm sources, e.g. `@elastic/start-local`. */
  package?: string
  /** GitHub clone URL, e.g. `https://github.com/elastic/elastic-local`. */
  cloneUrl?: string
  /** Derived repo/package base name (without scope or owner), e.g. `elastic-local`. */
  baseName: string
  /** Derived short CLI name, e.g. `local`. */
  name: string
}

function parseSource (source: string): ParsedSource {
  if (source.startsWith('npm:')) {
    const pkg = source.slice('npm:'.length).trim()
    if (pkg.length === 0) throw new Error('npm source must include a package name, e.g. npm:elastic-local')
    // derive base name: strip scope prefix (@scope/) then derive CLI name
    const base = pkg.startsWith('@') ? pkg.slice(pkg.indexOf('/') + 1) : pkg
    const name = deriveName(base)
    assertSafeName(name)
    return { type: 'npm', package: pkg, baseName: base, name }
  }

  // github:owner/repo or bare owner/repo
  const slug = source.startsWith('github:') ? source.slice('github:'.length) : source
  const parts = slug.split('/')
  if (parts.length !== 2 || parts.some((p) => p.trim().length === 0)) {
    throw new Error(
      `Invalid GitHub source "${source}". Use github:owner/repo or owner/repo.`
    )
  }
  const owner = parts[0]!.trim()
  const repo = parts[1]!.trim()
  const name = deriveName(repo)
  assertSafeName(name)
  return {
    type: 'github',
    cloneUrl: `https://github.com/${owner}/${repo}`,
    baseName: repo,
    name,
  }
}

/**
 * Runs a command with an explicit args array (never shell: true).
 * Throws a descriptive error if the process exits non-zero or fails to start.
 */
function run (cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
    windowsHide: true,
    shell: false,
  })
  if (result.error != null) {
    throw new Error(`Failed to run ${cmd}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim()
    throw new Error(`${cmd} exited with code ${result.status}${stderr ? `:\n${stderr}` : ''}`)
  }
}

/**
 * Reads the `bin` field from a `package.json` in `dir` and returns the
 * resolved absolute path for `binName` (or the first bin entry if only one).
 * Returns `undefined` if no `package.json` or no matching bin entry exists.
 */
async function resolveNpmBin (dir: string, binName: string): Promise<string | undefined> {
  const pkgPath = join(dir, 'package.json')
  try {
    const raw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as Record<string, unknown>
    const bin = pkg['bin']
    if (bin == null) return undefined
    let rel: string | undefined
    if (typeof bin === 'string') {
      rel = bin
    } else if (typeof bin === 'object' && !Array.isArray(bin)) {
      const binMap = bin as Record<string, string>
      rel = binMap[binName] ?? Object.values(binMap)[0]
    }
    if (rel == null) return undefined
    return resolve(dir, rel)
  } catch {
    return undefined
  }
}

/**
 * Discovers the entrypoint executable in a GitHub clone directory.
 * Search order:
 *   1. `package.json` bin field pointing to `baseName`
 *   2. Executable named `baseName` in root, `bin/`, or `dist/`
 */
async function discoverGithubEntrypoint (installDir: string, baseName: string): Promise<string> {
  const fromBin = await resolveNpmBin(installDir, baseName)
  if (fromBin != null) {
    const abs = isAbsolute(fromBin) ? fromBin : join(installDir, fromBin)
    return abs
  }

  const candidates = [
    join(installDir, baseName),
    join(installDir, 'bin', baseName),
    join(installDir, 'dist', baseName),
  ]
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK)
      return c
    } catch {
      // not found or not executable
    }
  }

  throw new Error(
    `Could not find an entrypoint executable for "${baseName}" in ${installDir}. ` +
    `Expected a binary named "${baseName}" in the root, bin/, or dist/ directory, ` +
    'or a package.json with a bin field.'
  )
}

/** Asserts the entrypoint path is within the install directory (prevents symlink/config injection). */
function assertWithinInstallDir (entrypoint: string, installDir: string): void {
  const rel = entrypoint.startsWith(installDir + '/')
  if (!rel) {
    throw new Error(
      `Resolved entrypoint "${entrypoint}" is outside the install directory "${installDir}". ` +
      'Refusing to register this extension.'
    )
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs an extension from the given source string and registers it.
 *
 * @param source  One of: `github:owner/repo`, `owner/repo`, `npm:package-name`
 * @returns       The registered `InstalledExtension` entry
 */
export async function installExtension (source: string): Promise<InstalledExtension> {
  const parsed = parseSource(source)
  const installDir = join(extensionsDir(), `elastic-${parsed.name}`)

  await mkdir(installDir, { recursive: true })

  let entrypoint: string

  if (parsed.type === 'github') {
    run('git', ['clone', '--depth', '1', parsed.cloneUrl!, installDir], extensionsDir())

    // Build if package.json present
    const hasPkg = await readFile(join(installDir, 'package.json'), 'utf-8').then(() => true).catch(() => false)
    if (hasPkg) {
      run('npm', ['install', '--production', '--no-fund', '--no-audit'], installDir)
    }

    entrypoint = await discoverGithubEntrypoint(installDir, parsed.baseName)
  } else {
    // npm source
    run('npm', ['install', '--prefix', installDir, '--no-fund', '--no-audit', parsed.package!], extensionsDir())
    const binDir = join(installDir, 'node_modules', '.bin')
    const binName = parsed.baseName.startsWith('elastic-') ? parsed.baseName : `elastic-${parsed.name}`
    const candidates = [join(binDir, parsed.baseName), join(binDir, binName)]
    let found: string | undefined
    for (const c of candidates) {
      try { await access(c, constants.X_OK); found = c; break } catch { /* continue */ }
    }
    if (found == null) {
      // Fall back to package.json bin
      const pkgDir = join(installDir, 'node_modules', parsed.package!.replace(/^@[^/]+\//, ''))
      found = await resolveNpmBin(pkgDir, parsed.baseName)
    }
    if (found == null) {
      throw new Error(`Could not find a bin entry for "${parsed.package}" after npm install.`)
    }
    entrypoint = found
  }

  assertWithinInstallDir(resolve(entrypoint), resolve(installDir))

  const entry: InstalledExtension = {
    name: parsed.name,
    source,
    path: installDir,
    entrypoint: resolve(entrypoint),
  }
  await upsertExtension(entry)
  return entry
}

/**
 * Uninstalls the extension with the given name: removes its install directory
 * and deletes its entry from the registry. No-ops if the extension is not installed.
 */
export async function uninstallExtension (name: string): Promise<void> {
  const installDir = join(extensionsDir(), `elastic-${name}`)
  await rm(installDir, { recursive: true, force: true })
  await removeFromStore(name)
}
