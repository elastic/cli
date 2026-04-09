/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration file discovery, loading, validation, and context resolution.
 *
 * Pipeline:
 * 1. Create cosmiconfig explorer with ID 'elastic' for discovery
 * 2. Load and validate config file with Zod schemas
 * 3. Resolve the active context (default or --use-context override)
 * 4. Return typed ResolvedConfig to command handlers
 *
 * Supports:
 * - cosmiconfig discovery (searches standard locations)
 * - --config-file <path> override (bypass discovery)
 * - --use-context <name> override (select non-default context)
 * - Clear error messages with field paths and context names
 * - Structured error payloads (code + message)
 */

import { z } from 'zod'
import { cosmiconfig } from 'cosmiconfig'
import { ConfigFileSchema } from './schema.ts'
import type { ConfigFile, ResolvedConfig, ResolvedContext } from './types.ts'

/**
 * Creates a cosmiconfig explorer configured for the Elastic CLI.
 *
 * Uses application ID `elastic`, which causes cosmiconfig to search for:
 * - `.elasticrc`, `.elasticrc.yml`, `.elasticrc.yaml`, `.elasticrc.json`
 * - `elastic.config.js` / `.cjs` / `.mjs`
 * - `elastic` property in `package.json`
 *
 * The explorer searches from the given directory upward toward the home
 * directory (`searchStrategy: 'global'`).
 */
export function createExplorer () {
  return cosmiconfig('elastic', {
    searchStrategy: 'global'
  })
}

/**
 * Resolves a named context from a validated config into a `ResolvedConfig`.
 *
 * Only the service blocks that are actually defined in the context are
 * included in the returned object -- absent services are not present as
 * `undefined` keys.
 *
 * Precondition: `contextName` must be a key that exists in `config.contexts`.
 * The `loadConfig` pipeline enforces this before calling `resolveContext`.
 *
 * @param config - A fully validated `ConfigFile` object.
 * @param contextName - The key of the context to resolve.
 * @returns A `ResolvedConfig` wrapping only that context's service blocks.
 */
export function resolveContext (config: ConfigFile, contextName: string): ResolvedConfig {
  // non-null: caller (loadConfig) guarantees contextName exists in config.contexts
  const ctx = config.contexts[contextName]!
  const resolved: ResolvedContext = {}
  if (ctx.elasticsearch != null) resolved.elasticsearch = ctx.elasticsearch
  if (ctx.kibana != null) resolved.kibana = ctx.kibana
  if (ctx.cloud != null) resolved.cloud = ctx.cloud
  const result: ResolvedConfig = { context: resolved }
  if (config.commands != null) result.commands = config.commands
  return result
}

/** Options accepted by {@link loadConfig}. */
export interface LoadConfigOptions {
  /** Directory to start cosmiconfig discovery from. Defaults to `process.cwd()`. */
  searchFrom?: string
  /** Explicit path to a config file. Bypasses cosmiconfig discovery when set. */
  configPath?: string
  /** Context name override (`--use-context` flag). Overrides `current_context` in the file. */
  contextName?: string
}

/** Successful result from {@link loadConfig}. */
export interface LoadConfigOk { ok: true, value: ResolvedConfig }

/** Failure result from {@link loadConfig}. */
export interface LoadConfigErr { ok: false, error: { message: string } }

/** Discriminated result type returned by {@link loadConfig}. */
export type LoadConfigResult = LoadConfigOk | LoadConfigErr

/**
 * Full config loading pipeline: discover/load → validate → resolve context.
 *
 * Steps:
 * 1. Load raw config via cosmiconfig (discovery or explicit path)
 * 2. Validate with `ConfigFileSchema` (Zod)
 * 3. Resolve the active context (from `contextName` override or `current_context`)
 * 4. Return a typed `ResolvedConfig`
 *
 * All failure modes return `{ ok: false, error: { message } }` -- never throw.
 *
 * @param options - Optional overrides for search root, config path, and context name.
 * @returns A `LoadConfigResult` discriminated union.
 */
export async function loadConfig (options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const { searchFrom, configPath, contextName } = options
  const explorer = createExplorer()

  // Step 1: load raw config
  let raw: unknown
  try {
    const result = configPath != null
      ? await explorer.load(configPath)
      : await explorer.search(searchFrom)

    if (result == null) {
      return {
        ok: false,
        error: { message: 'No configuration file found. Create a .elasticrc.yml in your home directory or project root.' }
      }
    }

    raw = result.config
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { message } }
  }

  // Step 2: validate with Zod
  const parsed = ConfigFileSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: { message: z.prettifyError(parsed.error) } }
  }

  const config = parsed.data

  // Step 3: resolve context name (--use-context override or current_context from file)
  const resolvedContextName = contextName ?? config.current_context

  if (!(resolvedContextName in config.contexts)) {
    const available = Object.keys(config.contexts).join(', ')
    return {
      ok: false,
      error: {
        message: `Context "${resolvedContextName}" not found. Available contexts: ${available}`
      }
    }
  }

  // Step 4: resolve and return
  return { ok: true, value: resolveContext(config, resolvedContextName) }
}
