/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Top-level aliases that the CLI rewrites to their `stack`-prefixed form.
 *
 * `elastic es ...` and `elastic kb ...` (plus the long forms) are user-facing
 * shortcuts; internally they route through `stack es` / `stack kb` so policy
 * dot-paths (e.g. `stack.es.search`) and routing logic stay uniform.
 */
const TOP_LEVEL_ALIASES = new Set(['es', 'elasticsearch', 'kb', 'kibana'])

/**
 * Returns a new array with `'stack'` prepended when the first word is one of
 * the recognised top-level aliases (`es`, `elasticsearch`, `kb`, `kibana`).
 * In every other case the input is returned as a shallow copy unchanged.
 *
 * Pure: never mutates its argument. Use this from both the main CLI entry
 * point (to keep argv consistent for `program.parseAsync`) and the
 * `__complete` handler (to walk the right subtree when the user types
 * `elastic es <tab>`).
 *
 * @param words - command words as they appear after the program name
 */
export function rewriteTopLevelAliases (words: readonly string[]): string[] {
  const first = words[0]
  if (first != null && TOP_LEVEL_ALIASES.has(first)) {
    return ['stack', ...words]
  }
  return [...words]
}
