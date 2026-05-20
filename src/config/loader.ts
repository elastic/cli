/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration file discovery, loading, validation, and context resolution.
 *
 * Pipeline (lazy validation):
 * 1. Discover config file in home directory (or via --config-file / ELASTIC_CLI_CONFIG_FILE)
 * 2. Structural validation of the outer config shape (without resolving expressions)
 * 3. Resolve context name (default or --use-context override)
 * 4. Resolve expressions only in the active context and commands section
 * 5. Validate active context with full Zod schemas
 * 6. Return typed ResolvedConfig to command handlers
 *
 * Only the active context's expressions are resolved, so inactive contexts
 * with unset environment variables or missing files will not cause failures.
 *
 * Supports:
 * - Home-directory discovery (~/.elasticrc.yml and variants)
 * - --config-file <path> or ELASTIC_CLI_CONFIG_FILE env var (bypass discovery)
 * - --use-context <name> override (select non-default context)
 * - Clear error messages with field paths and context names
 * - Structured error payloads (code + message)
 */

import { access, constants, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { ContextSchema, CommandPolicySchema, StructuralConfigSchema } from './schema.ts'
import { resolveExpressions } from '@elastic/config-resolver'
import { hasInlineSecrets, type RawConfig } from './writer.ts'
import type { ConfigFile, ResolvedConfig, ResolvedContext } from './types.ts'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './profiles.ts'

/** Extensions that are rejected to prevent arbitrary code execution. */
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs'])

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
 * Reads and parses a config file from disk.
 *
 * Supports YAML (`.yml`, `.yaml`) and JSON (`.json`) files, plus
 * extensionless files (parsed as YAML, which is a superset of JSON).
 *
 * Executable formats (`.js`, `.ts`, `.mjs`, `.cjs`) are rejected to
 * prevent arbitrary code execution.
 *
 * @param filePath - Absolute path to the config file.
 * @returns The parsed config object.
 */
export async function loadConfigFile (filePath: string): Promise<unknown> {
  const ext = extname(filePath)
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    throw new Error(
      'JavaScript and TypeScript config files are not supported for security reasons. Use .elasticrc.yml instead.'
    )
  }

  const content = await readFile(filePath, 'utf-8')
  if (ext === '.json') return JSON.parse(content) as unknown
  return parseYaml(content) as unknown
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
/**
 * Computes the effective command policy from the per-context policy, the root policy,
 * a `default_profile` fallback, and an optional `--profile` flag override.
 *
 * Precedence (highest to lowest):
 *  1. `profileOverride` — the `--profile` CLI flag
 *  2. Per-context `commands.profile` / `commands.allowed`
 *  3. Root `commands.profile` / `commands.allowed`
 *  4. `defaultProfile` — `default_profile` from the root config
 *
 * `blocked` lists from context and root are unioned (further restriction always applies).
 * `profile` and `allowed` are mutually exclusive; passing `--profile` with a context
 * that declares `commands.allowed` is an error.
 *
 * Returns `undefined` when no filtering is active (allow everything).
 * Returns `{ error }` on an invalid combination.
 */
export function resolveEffectiveCommands (
  contextCommands: ConfigFile['commands'],
  rootCommands: ConfigFile['commands'],
  defaultProfile: BuiltInProfile | undefined,
  profileOverride: BuiltInProfile | undefined,
): { commands: ConfigFile['commands'] } | { error: string } {
  // Effective allowed/blocked from config (context overrides root)
  const effectiveAllowed = contextCommands?.allowed ?? rootCommands?.allowed
  const contextBlocked = contextCommands?.blocked ?? []
  const rootBlocked = rootCommands?.blocked ?? []
  const effectiveBlocked = [...contextBlocked, ...rootBlocked.filter(p => !contextBlocked.includes(p))]

  // Effective profile from precedence chain
  const configProfile = contextCommands?.profile ?? rootCommands?.profile ?? defaultProfile
  const effectiveProfile = profileOverride ?? configProfile

  // Validate: --profile flag cannot be used when allowed is set
  if (profileOverride != null && effectiveAllowed != null) {
    return { error: '--profile flag cannot be used with a context that has commands.allowed set' }
  }

  const hasProfile = effectiveProfile != null
  const hasAllowed = effectiveAllowed != null
  const hasBlocked = effectiveBlocked.length > 0

  if (!hasProfile && !hasAllowed && !hasBlocked) return { commands: undefined }

  return {
    commands: {
      ...(hasProfile && { profile: effectiveProfile }),
      ...(hasAllowed && { allowed: effectiveAllowed }),
      ...(hasBlocked && { blocked: effectiveBlocked }),
    },
  }
}

export function resolveContext (config: ConfigFile, contextName: string, profileOverride?: BuiltInProfile): ResolvedConfig {
  // non-null: caller (loadConfig) guarantees contextName exists in config.contexts
  const ctx = config.contexts[contextName]!
  const resolved: ResolvedContext = {}
  if (ctx.elasticsearch != null) resolved.elasticsearch = ctx.elasticsearch
  if (ctx.kibana != null) resolved.kibana = ctx.kibana
  if (ctx.cloud != null) resolved.cloud = ctx.cloud
  const result: ResolvedConfig = { context: resolved }

  const effectiveCommandsResult = resolveEffectiveCommands(
    ctx.commands,
    config.commands,
    config.default_profile,
    profileOverride,
  )
  if ('error' in effectiveCommandsResult) {
    // Surface the error; callers (loadConfig) catch this and return LoadConfigErr
    throw new Error(effectiveCommandsResult.error)
  }
  if (effectiveCommandsResult.commands != null) result.commands = effectiveCommandsResult.commands

  if (config.banner != null) result.banner = config.banner
  return result
}

/**
 * Emits a stderr warning when `path` is world/group-readable AND contains at
 * least one unresolved inline secret (password / api_key without `$(...)`).
 * Silent on Windows (mode bits are not meaningful). Errors are swallowed; a
 * warning that fails to emit must not block command execution.
 */
async function warnOnLoosePermsIfInlineSecrets (path: string, raw: unknown): Promise<void> {
  if (process.platform === 'win32') return
  try {
    const st = await stat(path)
    const mode = st.mode & 0o777
    if (mode === 0o600 || mode === 0o400) return
    if (!isRawConfigLike(raw) || !hasInlineSecrets(raw)) return
    process.stderr.write(
      `Warning: config file "${path}" has permissions ${mode.toString(8).padStart(3, '0')} and contains inline secrets. ` +
      'Run `chmod 0600 ' + path + '` to restrict access, or migrate secrets into the OS keychain via `elastic config context edit`.\n'
    )
  } catch {
    // ignore
  }
}

/** Narrows an unknown (just-parsed) value to something `hasInlineSecrets` can walk. */
function isRawConfigLike (raw: unknown): raw is RawConfig {
  if (raw == null || typeof raw !== 'object') return false
  const contexts = (raw as Record<string, unknown>).contexts
  return contexts != null && typeof contexts === 'object'
}

/** Options accepted by {@link loadConfig}. */
export interface LoadConfigOptions {
  /** Explicit path to a config file. Bypasses discovery when set. */
  configPath?: string
  /** Context name override (`--use-context` flag). Overrides `current_context` in the file. */
  contextName?: string
  /** Profile name override (`--profile` flag). Overrides any profile set in the config file. */
  profileName?: BuiltInProfile
  /**
   * When `true`, bypass the in-process cache and perform a fresh load (caching
   * the new result for subsequent calls). Defaults to `false`.
   */
  refresh?: boolean
}

// ---------------------------------------------------------------------------
// In-process result cache — avoids redundant I/O within a single CLI invocation.
// Tests can call clearConfigCache() between cases to prevent state leakage.
// ---------------------------------------------------------------------------

let _cachedConfig: LoadConfigResult | undefined

/** Clears the in-process config cache. Intended for test cleanup only. */
export function clearConfigCache (): void {
  _cachedConfig = undefined
}

/** Successful result from {@link loadConfig}. */
export interface LoadConfigOk { ok: true, value: ResolvedConfig, contextName: string }

/** Failure result from {@link loadConfig}. */
export interface LoadConfigErr { ok: false, error: { message: string } }

/** Discriminated result type returned by {@link loadConfig}. */
export type LoadConfigResult = LoadConfigOk | LoadConfigErr

/**
 * Full config loading pipeline with lazy expression resolution.
 *
 * Steps:
 * 1. Discover or resolve config file path, then read and parse it
 * 2. Structural validation (shape only, no expression resolution)
 * 3. Resolve context name (from `contextName` override or `current_context`)
 * 4. Extract active context raw data + commands section
 * 5. Resolve expressions only in the active context and commands
 * 6. Validate active context with ContextSchema, commands with CommandPolicySchema
 * 7. Return a typed `ResolvedConfig`
 *
 * Only the active context's expressions are resolved, so inactive contexts
 * with unset environment variables or missing files will not cause failures.
 *
 * All failure modes return `{ ok: false, error: { message } }` -- never throw.
 *
 * @param options - Optional overrides for search root, config path, and context name.
 * @returns A `LoadConfigResult` discriminated union.
 */
export async function loadConfig (options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const { configPath, contextName, profileName, refresh = false } = options

  if (!refresh && _cachedConfig !== undefined) return _cachedConfig

  // Validate profileName early (before any I/O) so the error is immediate and clear
  if (profileName != null && !(BUILT_IN_PROFILES as readonly string[]).includes(profileName)) {
    const valid = BUILT_IN_PROFILES.join(', ')
    return { ok: false, error: { message: `Unknown profile "${profileName}". Valid profiles: ${valid}` } }
  }

  // Step 1: load raw config
  // Precedence: --config-file flag > ELASTIC_CLI_CONFIG_FILE env var > home-directory discovery
  let raw: unknown
  let resolvedPath: string | null
  try {
    const envConfigFile = process.env[ENV_CONFIG_FILE]
    if (configPath != null) {
      resolvedPath = configPath
    } else if (envConfigFile != null && envConfigFile.length > 0) {
      resolvedPath = envConfigFile
    } else {
      resolvedPath = await discoverConfigFile()
    }

    if (resolvedPath == null) {
      return {
        ok: false,
        error: { message: 'No configuration file found. Create a .elasticrc.yml in your home directory, or use --config-file / ELASTIC_CLI_CONFIG_FILE to specify a path.' }
      }
    }

    raw = await loadConfigFile(resolvedPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { message } }
  }

  // Warn (stderr only) when the file has inline secrets AND looser-than-0600 perms.
  if (resolvedPath != null) {
    await warnOnLoosePermsIfInlineSecrets(resolvedPath, raw)
  }

  // Step 2: structural validation (shape only, no deep context validation)
  const structural = StructuralConfigSchema.safeParse(raw)
  if (!structural.success) {
    return { ok: false, error: { message: z.prettifyError(structural.error) } }
  }

  const { current_context, contexts, commands: rawCommands, default_profile: rawDefaultProfile } = structural.data

  // Step 3: resolve context name (--use-context override or current_context from file)
  const resolvedContextName = contextName ?? current_context

  if (!(resolvedContextName in contexts)) {
    const available = Object.keys(contexts).join(', ')
    return {
      ok: false,
      error: {
        message: `Context "${resolvedContextName}" not found. Available contexts: ${available}`
      }
    }
  }

  // Validate default_profile if present
  let defaultProfile: BuiltInProfile | undefined
  if (rawDefaultProfile != null) {
    if (!(BUILT_IN_PROFILES as readonly unknown[]).includes(rawDefaultProfile)) {
      const valid = BUILT_IN_PROFILES.join(', ')
      return { ok: false, error: { message: `default_profile: unknown profile "${String(rawDefaultProfile)}". Valid profiles: ${valid}` } }
    }
    defaultProfile = rawDefaultProfile as BuiltInProfile
  }

  // Step 4: resolve expressions only in active context and commands (in parallel)
  let resolvedRawContext: unknown
  let resolvedRawCommands: unknown
  try {
    [resolvedRawContext, resolvedRawCommands] = await Promise.all([
      resolveExpressions(contexts[resolvedContextName], `contexts.${resolvedContextName}`),
      rawCommands != null ? resolveExpressions(rawCommands, 'commands') : undefined,
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { message: `Failed to resolve config expressions: ${message}` } }
  }

  // Step 5: validate active context and commands with full schemas
  const contextParsed = ContextSchema.safeParse(resolvedRawContext)
  if (!contextParsed.success) {
    return { ok: false, error: { message: z.prettifyError(contextParsed.error) } }
  }

  let commands: ConfigFile['commands']
  if (resolvedRawCommands != null) {
    const commandsParsed = CommandPolicySchema.safeParse(resolvedRawCommands)
    if (!commandsParsed.success) {
      return { ok: false, error: { message: z.prettifyError(commandsParsed.error) } }
    }
    commands = commandsParsed.data
  }

  // Step 6: build and return ResolvedConfig (delegate to resolveContext)
  const config: ConfigFile = {
    current_context: resolvedContextName,
    contexts: { [resolvedContextName]: contextParsed.data },
    ...(commands != null && { commands }),
    ...(defaultProfile != null && { default_profile: defaultProfile }),
    ...(structural.data.banner != null && { banner: structural.data.banner }),
  }
  let result: LoadConfigResult
  try {
    result = { ok: true, value: resolveContext(config, resolvedContextName, profileName), contextName: resolvedContextName }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result = { ok: false, error: { message } }
  }
  _cachedConfig = result
  return result
}
