/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command, Option } from 'commander'

/**
 * Bit-field directives returned alongside completion candidates.
 *
 * Borrowed from Cobra's `ShellCompDirective` so shell wrappers can translate
 * a single integer into per-shell completion settings. Each wrapper script
 * masks the relevant bits and applies the corresponding shell option.
 */
export const DIRECTIVE_NONE = 0
/** Do not insert a trailing space after the candidate (used for `--flag=` form). */
export const DIRECTIVE_NO_SPACE = 1 << 0
/** Suppress the shell's default file/directory completion fallback. */
export const DIRECTIVE_NO_FILE_COMP = 1 << 1
/** Reserved for future use: filter the shell's file completion by extension. */
export const DIRECTIVE_FILTER_FILE_EXT = 1 << 2

/** Result returned by {@link enumerate}. */
export interface CompletionResult {
  /** Candidate strings, already prefix-filtered against the current incomplete word. */
  candidates: string[]
  /** Bit-field of `DIRECTIVE_*` values. Always includes `DIRECTIVE_NO_FILE_COMP`. */
  directive: number
}

/** Function that produces dynamic candidates (e.g. context names) for a flag. */
export type DynamicCompleter = () => string[] | Promise<string[]>

/**
 * Lookup table for dynamic completers keyed by flag long name (including `--`).
 *
 * Returning `undefined` for an unknown flag is mandatory: the completion path
 * MUST NOT throw or block, so completers that are unavailable for the current
 * environment simply do not register themselves.
 */
export interface DynamicCompleterRegistry {
  get(flagLong: string): DynamicCompleter | undefined
}

// Commander stores hidden state on an internal `_hidden` field that is not
// part of the public typings; mirror the discriminator the factory uses.
function isHidden (cmd: Command): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cmd as unknown as any)._hidden === true
}

/**
 * Returns the visible child of `cmd` whose name OR alias equals `word`.
 * Hidden children are skipped. Returns `undefined` when no match.
 */
function findChild (cmd: Command, word: string): Command | undefined {
  for (const child of cmd.commands) {
    if (isHidden(child)) continue
    if (child.name() === word) return child
    if (child.aliases().includes(word)) return child
  }
  return undefined
}

/**
 * Returns all visible child names + aliases of `cmd`.
 *
 * Aliases are exposed so users see both `es` and `elasticsearch` when typing
 * `elastic stack <tab>`. Order follows the registration order of children.
 */
function collectChildren (cmd: Command): string[] {
  const out: string[] = []
  for (const child of cmd.commands) {
    if (isHidden(child)) continue
    out.push(child.name())
    for (const alias of child.aliases()) out.push(alias)
  }
  return out
}

/**
 * Returns the union of `current`'s and `root`'s long flag names, plus `--help`.
 *
 * Root flags are always included so global options (e.g. `--json`,
 * `--config-file`) are completable at every depth. Duplicates are removed.
 */
function collectFlags (current: Command, root: Command): string[] {
  const out = new Set<string>()
  for (const c of new Set([current, root])) {
    for (const opt of c.options as Option[]) {
      if (opt.long != null) out.add(opt.long)
    }
  }
  out.add('--help')
  return Array.from(out)
}

/**
 * Returns true if `word` matches a known option that accepts a value.
 * Used by the walk loop to skip past a flag's value token when descending.
 */
function optionTakesArg (current: Command, root: Command, word: string): boolean {
  for (const c of new Set([current, root])) {
    for (const opt of c.options as Option[]) {
      if (opt.long === word || opt.short === word) {
        return opt.required === true || opt.optional === true
      }
    }
  }
  return false
}

function prefixFilter (candidates: readonly string[], prefix: string): string[] {
  if (prefix === '') return [...candidates]
  return candidates.filter((c) => c.startsWith(prefix))
}

/**
 * Invokes a dynamic completer in an error-tolerant wrapper.
 *
 * Completion must never bubble exceptions out to the shell; on any failure
 * we fall back to an empty candidate list so tab simply yields no suggestions.
 */
async function safeRun (fn: DynamicCompleter): Promise<string[]> {
  try {
    const result = await fn()
    return Array.isArray(result) ? result : []
  } catch {
    return []
  }
}

/**
 * Computes completion candidates for a partially-typed `elastic` command line.
 *
 * Algorithm (in priority order):
 *
 * 1. Walk into the command tree from `root` along `words[0..n-2]`, skipping
 *    flag-shaped tokens (and their value tokens for options that take a value).
 *    The current word is `words[n-1]` (treated as `''` when `words` is empty).
 * 2. If the current word has the `--flag=partial` shape AND `flag` is a
 *    registered dynamic flag, return that completer's candidates filtered by
 *    `partial`, with `DIRECTIVE_NO_SPACE` to keep the cursor adjacent.
 * 3. If the current word starts with `--`, return matching long flags from the
 *    deepest command plus the root program (so globals are always visible).
 * 4. If the immediately previous token is a registered dynamic flag (e.g.
 *    `--use-context`), return that completer's candidates filtered by the
 *    current word.
 * 5. Otherwise, return the subcommand names and aliases of the deepest matched
 *    command/group, filtered by the current word.
 *
 * Result is always returned (never thrown). `directive` always carries
 * `DIRECTIVE_NO_FILE_COMP` so the shell does not fall back to filename
 * completion for our command tokens.
 *
 * @param root - top-level program command (with all loaded subtrees attached)
 * @param words - command words after the program name; empty array is allowed
 * @param registry - optional dynamic completer lookup (e.g. context names)
 */
export async function enumerate (
  root: Command,
  words: readonly string[],
  registry?: DynamicCompleterRegistry,
): Promise<CompletionResult> {
  const arr = words.length === 0 ? [''] : Array.from(words)
  const incomplete = arr[arr.length - 1] ?? ''
  const completedWords = arr.slice(0, -1)

  let current: Command = root
  for (let i = 0; i < completedWords.length; i++) {
    const w = completedWords[i]!
    if (w.startsWith('-')) {
      if (!w.includes('=') && optionTakesArg(current, root, w) && i + 1 < completedWords.length) {
        i++
      }
      continue
    }
    const child = findChild(current, w)
    if (child == null) break
    current = child
  }

  const previous = completedWords.length > 0 ? completedWords[completedWords.length - 1] : undefined

  if (incomplete.startsWith('--') && incomplete.includes('=')) {
    const eqIdx = incomplete.indexOf('=')
    const flag = incomplete.slice(0, eqIdx)
    const partial = incomplete.slice(eqIdx + 1)
    const completer = registry?.get(flag)
    if (completer != null) {
      const cands = await safeRun(completer)
      return {
        candidates: prefixFilter(cands, partial),
        directive: DIRECTIVE_NO_FILE_COMP | DIRECTIVE_NO_SPACE,
      }
    }
    return { candidates: [], directive: DIRECTIVE_NO_FILE_COMP }
  }

  if (incomplete.startsWith('--')) {
    const flags = collectFlags(current, root)
    return {
      candidates: prefixFilter(flags, incomplete),
      directive: DIRECTIVE_NO_FILE_COMP,
    }
  }

  if (previous != null && previous.startsWith('--')) {
    const completer = registry?.get(previous)
    if (completer != null) {
      const cands = await safeRun(completer)
      return {
        candidates: prefixFilter(cands, incomplete),
        directive: DIRECTIVE_NO_FILE_COMP,
      }
    }
    // Previous is a flag but no completer registered: yield no candidates,
    // but stay in NO_FILE_COMP mode so the shell doesn't surprise the user.
    return { candidates: [], directive: DIRECTIVE_NO_FILE_COMP }
  }

  const cands = collectChildren(current)
  return {
    candidates: prefixFilter(cands, incomplete),
    directive: DIRECTIVE_NO_FILE_COMP,
  }
}
