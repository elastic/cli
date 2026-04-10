/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global flags that consume the next argument as their value.
 * Used to skip value tokens when scanning argv for the first subcommand.
 */
const VALUE_FLAGS = new Set(['--config-file', '--use-context'])

/**
 * Returns the first non-flag, non-value argument from an argv array,
 * i.e. the top-level subcommand name.
 *
 * Handles the case where global options (e.g. `--use-context staging`)
 * precede the subcommand name, which would cause a naive `argv[2]` lookup
 * to return the flag instead of the subcommand.
 *
 * @param argv - Full argv array (e.g. `process.argv`)
 * @returns The first subcommand name, or `undefined` if none is present
 */
export function firstSubcommand(argv: string[]): string | undefined {
  const args = argv.slice(2)
  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg == null) break
    if (arg.startsWith('-')) {
      // skip the value of flags that require one
      if (VALUE_FLAGS.has(arg)) i++
      i++
      continue
    }
    return arg
  }
  return undefined
}
