/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration file discovery, loading, validation, and context resolution.
 *
 * Pipeline:
 * 1. Discover config file in home directory (or via --config-file / ELASTIC_CLI_CONFIG_FILE)
 * 2. Resolve expressions in config values (e.g. $(env:VAR), $(cmd:...), $(keychain:...))
 * 3. Validate resolved config with Zod schemas
 * 4. Resolve the active context (default or --use-context override)
 * 5. Return typed ResolvedConfig to command handlers
 *
 * Supports:
 * - Home-directory discovery (~/.elasticrc.yml and variants)
 * - --config-file <path> or ELASTIC_CLI_CONFIG_FILE env var (bypass discovery)
 * - --use-context <name> override (select non-default context)
 * - Clear error messages with field paths and context names
 * - Structured error payloads (code + message)
 */

import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { cosmiconfig } from 'cosmiconfig'
import { ConfigFileSchema } from './schema.ts'
import { resolveExpressions } from './resolvers.ts'
import type { ConfigFile, ResolvedConfig, ResolvedContext } from './types.ts'

/**
 * Loader that rejects executable config formats for security.
 *
 * Cosmiconfig's default loaders will `import()` JavaScript and TypeScript
 * files, which enables arbitrary code execution from untrusted directories.
 * This loader throws a descriptive error instead.
 */
function rejectExecutableLoader (): never {
  throw new Error(
    'JavaScript and TypeScript config files are not supported for security reasons. Use .elasticrc.yml instead.'
  )
}

/** File names checked during home-directory discovery, in priority order. */
const CONFIG_FILE_NAMES = ['.elasticrc', '.elasticrc.json', '.elasticrc.yaml', '.elasticrc.yml']

/** Environment variable that overrides config file discovery with an explicit path. */
const ENV_CONFIG_FILE = 'ELASTIC_CLI_CONFIG_FILE'

/**
 * Searches a single directory for the first readable config file.
 *
 * Checks each file name in {@link CONFIG_FILE_NAMES} order. Returns the
 * absolute path of the first readable match, or `null` if none is found.
 *
 * @param dir - Directory to search. Defaults to the user's home directory.
 */
export async function discoverConfigFile (dir?: string): Promise<string | null> {
  const searchDir = dir ?? homedir()
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = join(searchDir, name)
    try {
      await access(candidate, constants.R_OK)
      return candidate
    } catch { continue }
  }
  return null
}

/**
 * Creates a cosmiconfig explorer configured for the Elastic CLI.
 *
 * Used exclusively for {@link cosmiconfig.load | explorer.load()} to parse
 * YAML and JSON config files. Discovery is handled separately by
 * {@link discoverConfigFile}.
 *
 * Executable config formats (`.js`, `.ts`, `.mjs`, `.cjs`) are explicitly
 * blocked to prevent arbitrary code execution when a user passes
 * `--config-file` pointing at an executable file.
 */
export function createExplorer () {
  return cosmiconfig('elastic', {
    loaders: {
      '.js': rejectExecutableLoader,
      '.ts': rejectExecutableLoader,
      '.mjs': rejectExecutableLoader,
      '.cjs': rejectExecutableLoader,
    },
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
  /** Explicit path to a config file. Bypasses discovery when set. */
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
 * 2. Resolve expressions in string values (env, cmd, keychain)
 * 3. Validate with `ConfigFileSchema` (Zod)
 * 4. Resolve the active context (from `contextName` override or `current_context`)
 * 5. Return a typed `ResolvedConfig`
 *
 * All failure modes return `{ ok: false, error: { message } }` -- never throw.
 *
 * @param options - Optional overrides for search root, config path, and context name.
 * @returns A `LoadConfigResult` discriminated union.
 */
export async function loadConfig (options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const { configPath, contextName } = options
  const explorer = createExplorer()

  // Step 1: load raw config
  // Precedence: --config-file flag > ELASTIC_CLI_CONFIG_FILE env var > home-directory discovery
  let raw: unknown
  try {
    let result
    const envConfigFile = process.env[ENV_CONFIG_FILE]
    if (configPath != null) {
      result = await explorer.load(configPath)
    } else if (envConfigFile != null && envConfigFile.length > 0) {
      result = await explorer.load(envConfigFile)
    } else {
      const foundPath = await discoverConfigFile()
      result = foundPath != null ? await explorer.load(foundPath) : null
    }

    if (result == null) {
      return {
        ok: false,
        error: { message: 'No configuration file found. Create a .elasticrc.yml in your home directory, or use --config-file / ELASTIC_CLI_CONFIG_FILE to specify a path.' }
      }
    }

    raw = result.config
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { message } }
  }

  // Step 2: resolve expressions in string values
  try {
    raw = await resolveExpressions(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { message: `Failed to resolve config expressions: ${message}` } }
  }

  // Step 3: validate with Zod
  const parsed = ConfigFileSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: { message: z.prettifyError(parsed.error) } }
  }

  const config = parsed.data

  // Step 4: resolve context name (--use-context override or current_context from file)
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

  // Step 5: resolve and return
  return { ok: true, value: resolveContext(config, resolvedContextName) }
}
