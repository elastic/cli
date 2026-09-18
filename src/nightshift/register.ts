/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { createAskCommand } from './ask.ts'

/** Registers the `nightshift` command group and its subcommands. */
export function registerNightshiftCommands (): OpaqueCommandHandle {
  return defineGroup(
    { name: 'nightshift', description: 'Ask the Nightshift investigation agent' },
    createAskCommand(),
  )
}
