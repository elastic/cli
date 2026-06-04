/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lazy registration path for the `cloud` namespace.
 *
 * Imports only the minimal set of modules needed to display `elastic cloud
 * --help`: commander, the factory group builder, and the lightweight
 * PROMOTED_NAMESPACES constant.  The full API definition files (allCloudApis,
 * allServerlessApis) and Zod schema builders are NOT imported at module
 * evaluation time, keeping startup heap bounded.
 *
 * When the user invokes any actual cloud sub-command, the stub-swap mechanism
 * below loads the full command tree on demand.
 */

import { Command } from 'commander'
import { defineGroup } from '../factory-core.ts'
import type { OpaqueCommandHandle } from '../factory-core.ts'
import { PROMOTED_NAMESPACES } from './constants.ts'

/**
 * Returns a lightweight `cloud` command group whose sub-trees are stub
 * `Command` objects.  Stubs swap themselves for the real tree on first
 * invocation (any action or option processing).
 *
 * When `targetSubNamespace` is set (forwarded from `cli.ts` via `LoadOptions`),
 * the full tree is loaded eagerly so help shows real sub-commands.
 */
export async function registerCloudCommandsLazy (targetSubNamespace?: string): Promise<OpaqueCommandHandle> {
  if (targetSubNamespace != null) {
    const { registerCloudCommands } = await import('./register.js')
    return registerCloudCommands()
  }

  // Top-level `cloud --help` path: build minimal stubs for the top-level groups.
  const STUB_GROUPS: ReadonlyArray<{ name: string; description: string }> = [
    ...Array.from(PROMOTED_NAMESPACES.values()).map(name => ({
      name,
      description: `Cloud ${name} commands`,
    })),
    { name: 'hosted',     description: 'Manage Elastic Cloud Hosted deployments' },
    { name: 'serverless', description: 'Manage Elastic Serverless projects and resources' },
  ]

  const cloudGroup = defineGroup(
    { name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' },
  )

  for (const stub of STUB_GROUPS) {
    const cmd = new Command(stub.name)
    cmd.description(stub.description)
    cmd.allowUnknownOption(true)
    ;(cloudGroup as Command).addCommand(cmd)
  }

  return cloudGroup
}
