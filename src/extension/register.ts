/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic extension ...` command tree.
 *
 * Extension commands manage the locally installed extension registry. They do
 * not require a resolved Elastic config (no preAction hook) because they
 * operate on the extension registry at ~/.elastic/extensions.json, not on an
 * Elasticsearch or Kibana cluster.
 *
 * Commands:
 *   elastic extension list                  list installed extensions
 *   elastic extension install <source>      install from github: or npm:
 *   elastic extension remove <name>         uninstall by name
 */

import { defineCommand, defineGroup } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle } from '../factory.ts'
import { readExtensions } from './store.ts'
import { installExtension, uninstallExtension } from './installer.ts'

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList (): Promise<JsonValue> {
  const extensions = await readExtensions()
  return extensions.map((e) => ({
    name: e.name,
    source: e.source,
    path: e.path,
    entrypoint: e.entrypoint,
  })) as unknown as JsonValue
}

async function handleInstall (parsed: { arg?: string }): Promise<JsonValue> {
  const source = parsed.arg?.trim()
  if (source == null || source.length === 0) {
    return { error: { code: 'missing_source', message: 'A source is required. Use github:owner/repo or npm:package-name.' } }
  }
  const entry = await installExtension(source)
  return {
    installed: true,
    name: entry.name,
    source: entry.source,
    path: entry.path,
    entrypoint: entry.entrypoint,
  } as unknown as JsonValue
}

async function handleRemove (parsed: { arg?: string }): Promise<JsonValue> {
  const name = parsed.arg?.trim()
  if (name == null || name.length === 0) {
    return { error: { code: 'missing_name', message: 'An extension name is required.' } }
  }
  await uninstallExtension(name)
  return { removed: true, name } as unknown as JsonValue
}

// ---------------------------------------------------------------------------
// Command tree
// ---------------------------------------------------------------------------

/**
 * Builds the top-level `extension` command group.
 */
export function registerExtensionCommands (): OpaqueCommandHandle {
  const listCmd = defineCommand({
    name: 'list',
    description: 'List all installed extensions',
    handler: async () => handleList(),
  })

  const installCmd = defineCommand({
    name: 'install',
    description: 'Install an extension from a GitHub repo or npm package',
    positionalArg: {
      name: 'source',
      description: 'Install source: github:owner/repo, owner/repo, or npm:package-name',
      required: true,
    },
    handler: async (parsed) => handleInstall(parsed),
  })

  const removeCmd = defineCommand({
    name: 'remove',
    description: 'Uninstall an extension by name',
    positionalArg: {
      name: 'name',
      description: 'Short extension name (e.g. "local" for elastic-local)',
      required: true,
    },
    handler: async (parsed) => handleRemove(parsed),
  })

  return defineGroup(
    { name: 'extension', description: 'Manage elastic CLI extensions' },
    listCmd,
    installCmd,
    removeCmd,
  )
}
