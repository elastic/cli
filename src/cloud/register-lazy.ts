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
import { defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { PROMOTED_NAMESPACES } from './constants.ts'

/**
 * Returns a lightweight `cloud` command group whose sub-trees are stub
 * `Command` objects.  Stubs swap themselves for the real tree on first
 * invocation (any action or option processing).
 *
 * When the user requests help for a sub-group (e.g. `cloud hosted --help`),
 * the full tree is loaded eagerly so sub-command names appear correctly.
 */
export async function registerCloudCommandsLazy (): Promise<OpaqueCommandHandle> {
  // Sniff if the user is requesting a sub-group (e.g. `cloud hosted --help`).
  // If so, load the full command tree eagerly so help shows real sub-commands.
  // If the user only wants top-level cloud help, build lightweight stubs.
  /* c8 ignore next 7 */
  const tokens = process.argv.slice(2).filter(t => !t.startsWith('-'))
  const cloudArgIdx = tokens.indexOf('cloud')
  const subGroupRequested = cloudArgIdx >= 0 && tokens[cloudArgIdx + 1] != null
  if (subGroupRequested) {
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
    /* c8 ignore start */
    cmd.action(async () => {
      // Swap in the real cloud tree on first invocation of any stub.
      const { registerCloudCommands } = await import('./register.js')
      const realCloud = registerCloudCommands()
      const parent = cmd.parent
      if (parent != null) {
        const list = parent.commands as Command[]
        const cloudIdx = list.findIndex(c => c.name() === 'cloud')
        if (cloudIdx >= 0) list.splice(cloudIdx, 1)
        parent.addCommand(realCloud)
        await parent.parseAsync(process.argv)
      }
    })
    /* c8 ignore stop */
    ;(cloudGroup as Command).addCommand(cmd)
  }

  return cloudGroup
}
