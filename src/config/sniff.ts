/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-detection of Elasticsearch and Kibana versions.
 *
 * Detected versions are stored as `{ value, checked_ts }` under
 * `contexts.<name>.<service>.version`. A plain-string `version` is user-pinned
 * and is never sniffed or overwritten. Only that one node is edited (via
 * `yaml`'s `parseDocument`) so the user's comments and formatting survive.
 *
 * Every failure here fails open: detection must never block the user's command.
 */

import { access, constants, readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { scanEarlySniffState, type EarlySniffState, type ServiceVersionState } from './early-scan.ts'
import type { ResolvedContext } from './types.ts'

type Service = 'elasticsearch' | 'kibana'
const SERVICES: readonly Service[] = ['elasticsearch', 'kibana']

/** Detected versions older than this are re-sniffed. */
export const SNIFF_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** A failed sniff (stored as `checked_ts` without `value`) is retried after this long. */
export const SNIFF_RETRY_MS = 60 * 60 * 1000

/**
 * True when a service block needs a sniff: never tried, a detected version past
 * the TTL, or a failed attempt past the retry window.
 */
export function isSniffDue (state: ServiceVersionState, now = Date.now()): boolean {
  if (state.checkedTs == null) return state.version == null // plain string: pinned
  const checked = Date.parse(state.checkedTs)
  return Number.isNaN(checked) || now - checked > (state.version == null ? SNIFF_RETRY_MS : SNIFF_TTL_MS)
}

/** Derives the sniff state from parsed YAML, for configs the dependency-free scanner cannot read. */
async function stateFromYaml (text: string, contextName?: string): Promise<EarlySniffState | undefined> {
  const { parse } = await import('yaml')
  const raw = parse(text) as Record<string, any> | null // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctx = raw?.['contexts']?.[contextName ?? raw['current_context']]
  if (ctx == null || typeof ctx !== 'object') return undefined
  const state: EarlySniffState = { detectVersion: raw?.['detect_version'] !== false }
  for (const service of SERVICES) {
    const block = ctx[service]
    if (block == null || typeof block !== 'object') continue
    const v = block.version
    state[service] = v == null ? {} : typeof v === 'object'
      ? { ...(v.value != null && { version: String(v.value) }), checkedTs: String(v.checked_ts) }
      : { version: String(v) }
  }
  return state
}

/**
 * Sniffs `services`, then writes each result into the config file. Skips
 * everything when the file is JSON or not writable. A failure warns on stderr
 * (unless `warn` is false) and only refreshes `checked_ts`, keeping any earlier
 * `value`, so an unreachable service is not re-sniffed on every invocation.
 */
export async function detectAndStore (opts: {
  path: string
  contextName: string
  context: ResolvedContext
  services: readonly Service[]
  warn: boolean
}): Promise<void> {
  const { path, contextName, context, services, warn } = opts
  if (extname(path) === '.json') return
  try { await access(path, constants.W_OK) } catch { return }

  const { sniffVersion } = await import('../status/checks.ts')
  const found: Array<[Service, string | undefined]> = []
  await Promise.all(services.map(async (service) => {
    const block = context[service]
    if (block == null) return
    const r = await sniffVersion(service, block)
    found.push([service, r.ok ? r.value : undefined])
    if (r.ok || !warn) return
    const last = typeof block.version === 'object' ? block.version.value : undefined
    process.stderr.write(`warning: could not detect ${service} version (${r.error}); ${last != null ? `using last detected version ${last}` : 'continuing without version filtering'}\n`)
  }))
  if (found.length === 0) return

  const { parseDocument } = await import('yaml')
  const checked_ts = new Date().toISOString()
  try {
    const doc = parseDocument(await readFile(path, 'utf8'))
    for (const [service, value] of found) {
      const node = ['contexts', contextName, service, 'version']
      if (typeof doc.getIn(node) === 'string') continue // pinned since we looked
      if (value != null) doc.setIn(node, { value, checked_ts })
      else if (doc.hasIn([...node, 'value'])) doc.setIn([...node, 'checked_ts'], checked_ts)
      else doc.setIn(node, { checked_ts })
    }
    await writeFile(path, doc.toString())
  } catch (err) {
    // e.g. the service block is a YAML alias, which setIn cannot edit in place
    if (warn) process.stderr.write(`warning: could not save detected versions to ${path} (${(err as Error).message})\n`)
  }
}

/**
 * Early-startup entry point: sniffs the active context's services whose version
 * is missing or expired, before command registration. Secrets are resolved (by
 * the full loader) only when a sniff is actually due.
 */
export async function sniffIfDue (opts: { path: string, contextName?: string, json: boolean, explicitPath?: boolean }): Promise<void> {
  const { path, contextName, json, explicitPath = false } = opts
  let text: string
  try { text = await readFile(path, 'utf8') } catch { return }
  const state = scanEarlySniffState(text, contextName)
  const resolved = state === 'unsupported' ? await stateFromYaml(text, contextName).catch(() => undefined) : state
  if (resolved == null || !resolved.detectVersion) return
  const due = SERVICES.filter((s) => resolved[s] != null && isSniffDue(resolved[s]))
  if (due.length === 0) return

  const { loadConfig } = await import('./loader.ts')
  // Same options as the preAction hook so its call reuses this result (secret commands run once).
  const loaded = await loadConfig({ ...(explicitPath && { configPath: path }), ...(contextName != null && { contextName }) })
  if (!loaded.ok) return // the real error surfaces when the command runs
  await detectAndStore({ path, contextName: loaded.contextName, context: loaded.value.context, services: due, warn: !json })
}
