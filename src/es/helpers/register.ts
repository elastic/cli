/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineGroup } from '../../factory.ts'
import type { OpaqueCommandHandle } from '../../factory.ts'

/**
 * Registers all high-level helper commands under a `helpers` group.
 * Helper commands provide convenience abstractions over common Elasticsearch
 * workflows (bulk ingestion, scroll search, multi-search batching).
 *
 * @returns an `OpaqueCommandHandle` for the `helpers` group
 */
export function registerHelperCommands (): OpaqueCommandHandle {
  const commands: OpaqueCommandHandle[] = []

  return defineGroup(
    { name: 'helpers', description: 'High-level helper commands for common Elasticsearch workflows' },
    ...commands
  )
}
