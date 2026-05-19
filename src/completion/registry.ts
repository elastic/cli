/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default registry of dynamic completers for {@link enumerate}.
 *
 * Each entry maps a long flag name (including `--`) to a function that
 * computes the candidate values for that flag. Completers must never throw;
 * see the contract in `enumerate.ts`.
 *
 * Adding a new dynamic completer (e.g. `--index`, `--id`) is a matter of
 * implementing a `() => Promise<string[]>` function and registering it here.
 */

import type { DynamicCompleter, DynamicCompleterRegistry } from './enumerate.ts'
import { completeContextNames } from './completers/context-names.ts'

const DEFAULT_COMPLETERS: ReadonlyMap<string, DynamicCompleter> = new Map([
  ['--use-context', completeContextNames],
])

/** The shared registry used by the `__complete` command. */
export const defaultRegistry: DynamicCompleterRegistry = {
  get (flagLong: string): DynamicCompleter | undefined {
    return DEFAULT_COMPLETERS.get(flagLong)
  },
}
