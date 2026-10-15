/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dependency-free scanner for the config values command registration needs
 * before `yaml` is worth loading: the active context's `elasticsearch.version`
 * and `kibana.version`. Importing `yaml` costs ~60 CJS module loads on every
 * `--help`, so the common case (block-style mappings of scalars) is read here.
 *
 * Fails open: anything not provably understood returns `'unsupported'`, and the
 * caller falls back to the full loader. That includes every command-policy key
 * (`commands`, `default_profile`), since resolving a policy needs the loader.
 */

import { readFile } from 'node:fs/promises'

/** Version hints for the active context; absent keys mean no hint. */
export interface EarlyHints { elasticsearch?: string, kibana?: string }

const LINE = /^( *)([A-Za-z0-9_][A-Za-z0-9_.-]*):(?: +(.*))?$/
const POLICY_KEYS = new Set(['commands', 'default_profile'])
const NON_STRING_PLAIN = /^(true|false|null)$/i

/** Parses a scalar's text; returns undefined when it is not a one-line scalar we understand. */
function scalar (text: string, wantString: boolean): string | undefined {
  const quoted = /^"([^"\\]*)"\s*(#.*)?$/.exec(text) ?? /^'([^']*)'\s*(#.*)?$/.exec(text)
  if (quoted != null) return quoted[1]
  // flow collections, anchors/aliases, tags, block scalars, directives, quotes left open
  if (/^[{[&*!|>%@`"']/.test(text)) return undefined
  const plain = text.replace(/\s+#.*$/, '').trimEnd()
  if (plain === '' || plain === '~' || /: |:$/.test(plain)) return undefined
  if (!wantString) return plain
  // only accept plain scalars that yaml would also resolve to a string
  return (/^\d+(\.\d+){2,}$/.test(plain) || /^[A-Za-z][\w.-]*$/.test(plain)) && !NON_STRING_PLAIN.test(plain) ? plain : undefined
}

/** What the scanner knows about one service block of the active context. */
export interface ServiceVersionState {
  /** The version string; absent when the block has no `version`. */
  version?: string
  /** Set for the auto-detected `{ value, checked_ts }` form (`value` absent after a failed sniff); absent for a plain (pinned) string. */
  checkedTs?: string
}

/** Everything the early sniff decision needs from the active context. */
export interface EarlySniffState {
  /** Top-level `detect_version`; defaults to true. */
  detectVersion: boolean
  elasticsearch?: ServiceVersionState
  kibana?: ServiceVersionState
}

interface Scan { hints: EarlyHints, sniff: EarlySniffState }

/**
 * Scans config text for the active context's version hints.
 *
 * @param text - Raw config file contents.
 * @param contextName - `--use-context` override; defaults to `current_context`.
 * @returns The hints, or `'unsupported'` when the text uses anything beyond the supported subset.
 */
export function scanEarlyHints (text: string, contextName?: string): EarlyHints | 'unsupported' {
  const scanned = scan(text, contextName)
  return scanned === 'unsupported' ? scanned : scanned.hints
}

/**
 * Scans config text for the active context's version state: which services exist,
 * whether each has a pinned or detected version, and `detect_version`.
 *
 * @returns The state, or `'unsupported'` when the text uses anything beyond the supported subset.
 */
export function scanEarlySniffState (text: string, contextName?: string): EarlySniffState | 'unsupported' {
  const scanned = scan(text, contextName)
  return scanned === 'unsupported' ? scanned : scanned.sniff
}

function scan (text: string, contextName?: string): Scan | 'unsupported' {
  if (text.includes('\t')) return 'unsupported'
  const seen = new Set<string>()
  const stack: Array<{ indent: number, key: string }> = []
  const states = new Map<string, Map<string, ServiceVersionState>>() // context -> service -> state
  let detectVersion = true
  const contexts = new Set<string>()
  let current: string | undefined
  let prev: { indent: number, hasValue: boolean } | undefined

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const m = LINE.exec(line)
    if (m == null) return 'unsupported'
    const indent = m[1]!.length
    const key = m[2]!
    if (/^(true|false|null)$/i.test(key) || POLICY_KEYS.has(key)) return 'unsupported'
    if (prev != null && prev.hasValue && indent > prev.indent) return 'unsupported'
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop()
    if ((stack.length === 0) !== (indent === 0)) return 'unsupported'
    const path = [...stack.map(s => s.key), key]
    const id = path.join('\0')
    if (seen.has(id)) return 'unsupported'
    seen.add(id)

    const rest = m[3]
    const value = rest == null || rest.startsWith('#') ? undefined : rest
    const isService = path[0] === 'contexts' && (path[2] === 'elasticsearch' || path[2] === 'kibana')
    // a service block always precedes its children, so its state exists by the time they are seen
    const state = isService ? states.get(path[1]!)?.get(path[2]!) : undefined
    if (isService && path.length === 3) {
      if (!states.has(path[1]!)) states.set(path[1]!, new Map())
      states.get(path[1]!)!.set(path[2]!, {})
    }
    if (value != null) {
      const isVersion = path.length === 4 && isService && key === 'version'
      // auto-detected form: version: { value, checked_ts } as a nested block
      const isNested = path.length === 5 && isService && path[3] === 'version' && (key === 'value' || key === 'checked_ts')
      const parsed = scalar(value, isVersion || (isNested && key === 'value') || path.length === 1 && key === 'current_context')
      if (parsed == null) return 'unsupported'
      if (path.length === 1 && key === 'current_context') current = parsed
      if (path.length === 1 && key === 'detect_version') detectVersion = parsed.toLowerCase() !== 'false'
      if (isVersion || (isNested && key === 'value')) state!.version = parsed
      if (isNested && key === 'checked_ts') state!.checkedTs = parsed
    } else if (path.length === 2 && path[0] === 'contexts') {
      contexts.add(key)
    }
    if (value != null && path.length === 2 && path[0] === 'contexts') return 'unsupported' // scalar/flow context
    stack.push({ indent, key })
    prev = { indent, hasValue: value != null }
  }

  const name = contextName ?? current
  if (name == null || !contexts.has(name)) return 'unsupported'
  const hints: EarlyHints = {}
  const sniff: EarlySniffState = { detectVersion }
  for (const service of ['elasticsearch', 'kibana'] as const) {
    const state = states.get(name)?.get(service)
    if (state == null) continue
    sniff[service] = state
    if (state.version != null) hints[service] = state.version
  }
  return { hints, sniff }
}

/** Reads `path` and scans it; unreadable files are `'unsupported'` so the loader reports the error. */
export async function scanEarlyConfigFile (path: string, contextName?: string): Promise<EarlyHints | 'unsupported'> {
  try {
    return scanEarlyHints(await readFile(path, 'utf8'), contextName)
  } catch {
    return 'unsupported'
  }
}
