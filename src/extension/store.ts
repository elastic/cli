/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-disk registry of installed extensions.
 *
 * The registry is a JSON array persisted at `~/.elastic/extensions.json` with
 * 0o600 permissions (owner read/write only). Each entry records the extension
 * name, the install source, the path to the install directory, and the
 * resolved entrypoint executable.
 *
 * All public functions are async and safe to call concurrently for reads;
 * writes are not locked (single-writer assumption: the CLI runs one command
 * at a time).
 *
 * Security notes:
 * - The registry file is written with 0o600 permissions.
 * - All entries are validated against a schema on read so a corrupt or
 *   tampered file is rejected with a clear error rather than silently
 *   executing unexpected paths.
 * - Extension names are restricted to `[a-z0-9-]+` to prevent path traversal
 *   if a name is used to construct filesystem paths.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

let _platform: string = process.platform

/** @internal Override the platform for tests. */
export function _testSetPlatform (p: string): void {
  _platform = p
}

/** A single installed extension entry in the registry. */
export interface InstalledExtension {
  /** Short name, e.g. `"local"` for an extension invoked as `elastic local`. */
  name: string
  /**
   * Install source string as provided by the user, e.g.:
   * - `"github:elastic/elastic-local"`
   * - `"npm:@elastic/start-local"`
   */
  source: string
  /** Absolute path to the extension's install directory. */
  path: string
  /** Absolute path to the executable that is spawned when the extension runs. */
  entrypoint: string
}

/**
 * Safe extension name: lowercase letters, digits, and hyphens only.
 * Prevents path traversal if the name is used to construct filesystem paths.
 */
const SAFE_NAME_RE = /^[a-z0-9-]+$/

/**
 * Loose source format check: must start with a known prefix or contain a
 * slash (bare owner/repo). Rejects clearly invalid values while remaining
 * open to future prefixes.
 */
const SAFE_SOURCE_RE = /^(github:|npm:|git:|local:)|^[^:]+\//

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

let _registryPath: string | undefined

/**
 * Override the registry file path. Pass `undefined` to restore the default.
 * Intended for test use only.
 * @internal
 */
export function _testSetRegistryPath (p: string | undefined): void {
  _registryPath = p
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registryPath (): string {
  return _registryPath ?? join(homedir(), '.elastic', 'extensions.json')
}

/**
 * Validates that `value` is a well-formed `InstalledExtension`.
 * Throws a descriptive error if any field is missing, the wrong type,
 * contains an unsafe name, or has a non-absolute path.
 */
function validateEntry (value: unknown, index: number): InstalledExtension {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`extensions.json: entry at index ${index} is not an object`)
  }
  const obj = value as Record<string, unknown>

  for (const field of ['name', 'source', 'path', 'entrypoint'] as const) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      throw new Error(`extensions.json: entry[${index}].${field} must be a non-empty string`)
    }
  }

  const name = obj['name'] as string
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `extensions.json: entry[${index}].name "${name}" contains invalid characters (allowed: a-z, 0-9, hyphen)`
    )
  }

  const source = obj['source'] as string
  if (!SAFE_SOURCE_RE.test(source)) {
    throw new Error(
      `extensions.json: entry[${index}].source "${source}" does not match a recognised format (github:owner/repo, npm:package, local:/path, owner/repo)`
    )
  }

  for (const field of ['path', 'entrypoint'] as const) {
    const val = obj[field] as string
    if (!isAbsolute(val)) {
      throw new Error(`extensions.json: entry[${index}].${field} must be an absolute path, got "${val}"`)
    }
  }

  return {
    name,
    source: obj['source'] as string,
    path: obj['path'] as string,
    entrypoint: obj['entrypoint'] as string,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads and returns all installed extensions from the registry.
 * Returns an empty array if the registry file does not yet exist.
 * Throws if the file exists but contains invalid or tampered data.
 */
export async function readExtensions (): Promise<InstalledExtension[]> {
  let raw: string
  try {
    raw = await readFile(registryPath(), 'utf-8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('extensions.json: file is not valid JSON')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('extensions.json: expected a JSON array at the top level')
  }

  return parsed.map((entry, i) => validateEntry(entry, i))
}

/**
 * Persists the given extension list to the registry file with 0o600 permissions.
 * Creates `~/.elastic/` if it does not exist.
 */
export async function writeExtensions (extensions: InstalledExtension[]): Promise<void> {
  const path = registryPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(extensions, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  // Explicitly chmod in case the file already existed with broader permissions.
  // chmod is a no-op on Windows so we skip the call entirely.
  if (_platform !== 'win32') {
    await chmod(path, 0o600)
  }
}

/**
 * Returns the registry entry for the given extension name, or `undefined`
 * if no extension with that name is installed.
 */
export async function findExtension (name: string): Promise<InstalledExtension | undefined> {
  const extensions = await readExtensions()
  return extensions.find((e) => e.name === name)
}

/**
 * Adds or replaces an entry in the registry (matched by name) and persists.
 * Returns true when an existing entry was overwritten, false when a new entry was added.
 */
export async function upsertExtension (entry: InstalledExtension): Promise<boolean> {
  const extensions = await readExtensions()
  const idx = extensions.findIndex((e) => e.name === entry.name)
  const overwriting = idx !== -1
  const updated = overwriting
    ? extensions.map((e, i) => (i === idx ? entry : e))
    : [...extensions, entry]
  await writeExtensions(updated)
  return overwriting
}

/**
 * Removes the entry with the given name from the registry and persists.
 * No-ops if the name is not found.
 */
export async function removeExtension (name: string): Promise<void> {
  const extensions = await readExtensions()
  const filtered = extensions.filter((e) => e.name !== name)
  if (filtered.length === extensions.length) return
  await writeExtensions(filtered)
}
