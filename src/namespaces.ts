/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineGroup } from './factory.ts'
import type { OpaqueCommandHandle } from './factory.ts'

export interface LoadOptions {
  /**
   * When true, load all sub-commands eagerly (no lazy stubs).
   * Used by `cli-schema` to ensure every leaf has `_commandConfig` attached.
   * Callers that only need CLI startup should use the default (false).
   */
  eager?: boolean
}

/**
 * Declarative entry for a top-level CLI namespace.
 *
 * This is the single source of truth for namespace registration.
 * Both `cli.ts` (lazy stub/eager load) and `cli-schema` (always eager) consume
 * this list. Adding a new top-level namespace requires only adding an entry here.
 */
export interface NamespaceEntry {
  name: string
  description: string
  /** Fully load the namespace and return a registered command group handle. */
  load: (opts?: LoadOptions) => Promise<OpaqueCommandHandle>
}

export const NAMESPACES: NamespaceEntry[] = [
  {
    name: 'stack',
    description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)',
    load: async (opts) => {
      const eager = opts?.eager === true
      const [esModule, { registerKbCommands }] = await Promise.all([
        import('./es/register.ts'),
        import('./kb/register.ts'),
      ])
      const esGroup = eager
        ? await esModule.registerEsCommandsEager()
        : await esModule.registerEsCommandsLazy()
      esGroup.alias('elasticsearch')
      const kbGroup = registerKbCommands()
      kbGroup.alias('kibana')
      return defineGroup(
        { name: 'stack', description: 'Interact with Elastic Stack components (Elasticsearch, Kibana, Fleet)' },
        esGroup,
        kbGroup,
      )
    },
  },
  {
    name: 'cloud',
    description: 'Manage Elastic Cloud (hosted deployments and serverless projects)',
    load: async () => {
      const { registerCloudCommands } = await import('./cloud/register.ts')
      return registerCloudCommands()
    },
  },
  {
    name: 'docs',
    description: 'Search, read, and ask questions about Elastic documentation',
    load: async () => {
      const { registerDocsCommands } = await import('./docs/register.ts')
      return registerDocsCommands()
    },
  },
  {
    name: 'config',
    description: 'Author and maintain the elastic config file',
    load: async () => {
      const { registerConfigCommands } = await import('./config/commands.ts')
      return registerConfigCommands()
    },
  },
]
