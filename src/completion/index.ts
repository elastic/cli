/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Entry point for the shell completion subsystem.
 *
 * Exposes a single factory function that returns both Commander commands
 * the main CLI needs to register:
 *
 *   - `elastic completion <shell>` — public; prints a wrapper script
 *   - `elastic __complete -- <words>` — hidden; computes candidates
 *
 * Both commands are config-free; cli.ts adds them to the `preAction`
 * config-load skip list so completion never depends on a working config.
 */

import type { OpaqueCommandHandle } from '../factory.ts'
import { buildCompletionCommand } from './command.ts'
import { buildCompleteCommand } from './complete.ts'

/**
 * Returns the pair of commands the completion subsystem owns, in the order
 * they should be registered on the program (public command first so it
 * appears earlier in --help output).
 */
export function registerCompletionCommands (): OpaqueCommandHandle[] {
  return [buildCompletionCommand(), buildCompleteCommand()]
}

/** Names of the commands registered by {@link registerCompletionCommands}. */
export const COMPLETION_COMMAND_NAMES: readonly string[] = Object.freeze([
  'completion',
  '__complete',
])
