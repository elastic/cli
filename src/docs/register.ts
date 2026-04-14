/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { createSearchCommand } from './search.ts'
import { createAskCommand } from './ask.ts'
import { createChatCommand } from './chat.ts'
import { createReadCommand } from './read.ts'

export function registerDocsCommands (): OpaqueCommandHandle {
  return defineGroup(
    { name: 'docs', description: 'Search, read, and ask questions about Elastic documentation' },
    createSearchCommand(),
    createAskCommand(),
    createChatCommand(),
    createReadCommand(),
  )
}
