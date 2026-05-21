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
 *   elastic extension upgrade [name]        upgrade one or all extensions
 *   elastic extension search [query]        discover extensions via GitHub topic
 *   elastic extension create <name>         scaffold a new local extension
 */

import { defineCommand, defineGroup } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle } from '../factory.ts'
import { readExtensions } from './store.ts'
import { createLocalExtension, installExtension, uninstallExtension, upgradeExtension, upgradeAllExtensions } from './installer.ts'
import { searchExtensions } from './search.ts'

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

function handlerError (code: string, err: unknown): JsonValue {
  return { error: { code, message: err instanceof Error ? err.message : String(err) } } as unknown as JsonValue
}

async function handleInstall (parsed: { arg?: string }): Promise<JsonValue> {
  const source = parsed.arg?.trim()
  if (source == null || source.length === 0) {
    return { error: { code: 'missing_source', message: 'A source is required. Use github:owner/repo or npm:package-name.' } }
  }
  try {
    const { entry, overwritten } = await installExtension(source)
    return {
      installed: true,
      name: entry.name,
      source: entry.source,
      path: entry.path,
      entrypoint: entry.entrypoint,
      ...(overwritten && { warning: `Extension "${entry.name}" was already installed and has been overwritten.` }),
    } as unknown as JsonValue
  } catch (err) {
    return handlerError('install_failed', err)
  }
}

async function handleRemove (parsed: { arg?: string }): Promise<JsonValue> {
  const name = parsed.arg?.trim()
  if (name == null || name.length === 0) {
    return { error: { code: 'missing_name', message: 'An extension name is required.' } }
  }
  try {
    await uninstallExtension(name)
    return { removed: true, name } as unknown as JsonValue
  } catch (err) {
    return handlerError('remove_failed', err)
  }
}

async function handleUpgrade (parsed: { arg?: string }): Promise<JsonValue> {
  const name = parsed.arg?.trim()
  try {
    if (name != null && name.length > 0) {
      const updated = await upgradeExtension(name)
      return { upgraded: true, name: updated.name, source: updated.source, entrypoint: updated.entrypoint } as unknown as JsonValue
    }
    const all = await upgradeAllExtensions()
    return { upgraded: true, extensions: all.map((e) => ({ name: e.name, source: e.source })) } as unknown as JsonValue
  } catch (err) {
    return handlerError('upgrade_failed', err)
  }
}

async function handleCreate (parsed: { arg?: string; options: Record<string, string | number | boolean> }): Promise<JsonValue> {
  const name = parsed.arg?.trim()
  if (name == null || name.length === 0) {
    return { error: { code: 'missing_name', message: 'An extension name is required.' } }
  }
  const targetPath = typeof parsed.options['path'] === 'string' ? parsed.options['path'] : undefined
  try {
    const { entry, overwritten } = await createLocalExtension(name, targetPath)
    return {
      created: true,
      name: entry.name,
      source: entry.source,
      path: entry.path,
      entrypoint: entry.entrypoint,
      ...(overwritten && { warning: `Extension "${entry.name}" was already installed and has been overwritten.` }),
    } as unknown as JsonValue
  } catch (err) {
    return handlerError('create_failed', err)
  }
}

async function handleSearch (parsed: { arg?: string }): Promise<JsonValue> {
  const query = parsed.arg?.trim()
  try {
    const results = await searchExtensions(query)
    return results as unknown as JsonValue
  } catch (err) {
    return handlerError('search_failed', err)
  }
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

  const upgradeCmd = defineCommand({
    name: 'upgrade',
    description: 'Upgrade an installed extension, or all extensions if no name is given',
    positionalArg: {
      name: 'name',
      description: 'Short extension name to upgrade (omit to upgrade all)',
      required: false,
    },
    handler: async (parsed) => handleUpgrade(parsed),
  })

  const searchCmd = defineCommand({
    name: 'search',
    description: 'Discover extensions tagged with the elastic-extension GitHub topic',
    positionalArg: {
      name: 'query',
      description: 'Optional search terms to narrow results',
      required: false,
    },
    handler: async (parsed) => handleSearch(parsed),
  })

  const createCmd = defineCommand({
    name: 'create',
    description: 'Scaffold a new local extension with a JSON-outputting entrypoint',
    positionalArg: {
      name: 'name',
      description: 'Short extension name (e.g. "demo" → invoked as `elastic demo`)',
      required: true,
    },
    options: [
      {
        long: 'path',
        description: 'Target directory (defaults to ~/.elastic/extensions/elastic-<name>)',
        type: 'string',
      },
    ],
    handler: async (parsed) => handleCreate(parsed),
  })

  return defineGroup(
    { name: 'extension', description: 'Manage elastic CLI extensions' },
    listCmd,
    installCmd,
    removeCmd,
    upgradeCmd,
    searchCmd,
    createCmd,
  )
}
