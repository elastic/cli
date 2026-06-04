/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight core of the command factory — contains types and functions needed
 * to build command groups and render `--help` output.
 *
 * This module is separated from factory.ts to avoid pulling in heavy transitive
 * dependencies (Zod, schema-args, output formatters, config store) when all the
 * caller needs is to define group structure for lazy namespace loading.
 *
 * factory.ts re-exports everything from this module, so consumers that already
 * depend on the full factory do not need to change their imports.
 */

import { Command } from 'commander'
import type { z } from 'zod'
import type { ResolvedConfig, CommandPolicy } from './config/types.ts'
import { resolveBuiltinProfile } from './config/profiles.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Declared intent for a command, used by the CLI schema emitter. */
export interface CommandIntent {
  destructive?: boolean
  idempotent?: boolean
  scope?: 'file' | 'directory' | 'global'
  requiresConfirmation?: boolean
  requiresAuth?: boolean
}

/** Definition for a single CLI option (flag). */
export interface OptionDefinition {
  long: string
  short?: string
  description: string
  type?: 'string' | 'number' | 'boolean'
  required?: boolean
  defaultValue?: string | number | boolean
}

/** Recursive JSON value type used throughout the CLI for structured output. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Wraps a raw JSON string alongside its parsed form. Used to carry body values
 * that were provided as pre-serialised JSON (e.g. from stdin or --input-file).
 */
export class RawJsonValue {
  constructor (public readonly raw: string, public readonly parsed: unknown) {}
}

/** The parsed result passed to every command handler. */
export interface ParsedResult<T = unknown> {
  options: Record<string, string | number | boolean>
  config?: ResolvedConfig
  input?: T
  arg?: string
  rawBodyValues?: Record<string, RawJsonValue>
}

/** Full configuration for a leaf command (requires Zod for the input schema type). */
export interface CommandConfig<T extends z.ZodType = z.ZodType> {
  name: string
  description: string
  options?: OptionDefinition[]
  positionalArg?: { name: string; description: string; required?: boolean }
  handler: (parsed: ParsedResult<z.infer<T>>) => JsonValue | Promise<JsonValue>
  input?: T
  formatOutput?: (result: JsonValue, parsed: ParsedResult<z.infer<T>>) => string
  intent?: CommandIntent
}

/** Configuration for a command group (namespace). */
export interface GroupConfig {
  /** group name (lowercase alphanumeric and hyphens only) */
  name: string
  /** human-readable description shown in help text */
  description: string
}

/**
 * Opaque handle returned by {@link defineCommand} and {@link defineGroup}.
 *
 * Callers may pass this handle to {@link defineGroup} or register it with the CLI program
 * via `program.addCommand(handle)`. Do not depend on the internal structure of this type --
 * the underlying implementation may change without notice.
 */
export type OpaqueCommandHandle = import('commander').Command

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

/**
 * Validates a command or group name against the data-model rules.
 * @throws {Error} if the name is empty or contains invalid characters
 */
export function validateName (name: string, kind: 'command' | 'group'): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `invalid ${kind} name ${JSON.stringify(name)}: ` +
      'names must be non-empty and contain only lowercase letters, digits, and hyphens'
    )
  }
}

// ---------------------------------------------------------------------------
// Command visibility helpers
// ---------------------------------------------------------------------------

/** Mark a command as hidden (excluded from help output). */
export function setHidden (cmd: OpaqueCommandHandle, value: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(cmd as unknown as any)._hidden = value
}

/** Returns true if the command has been marked hidden. */
export function isHidden (cmd: OpaqueCommandHandle): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cmd as unknown as any)._hidden === true
}

/**
 * Returns true if `cmd` is a stub group — a group with no children that was
 * registered as a lazy-loading placeholder.
 *
 * Stub groups should never be hidden by policy because their children have not
 * been loaded yet; we cannot determine whether any child would be allowed.
 * When the user navigates into the group its children are loaded and filtered
 * correctly at that level.
 */
export function isStubGroup (cmd: OpaqueCommandHandle): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = cmd as unknown as any
  return c._isGroup === true && (c.commands == null || c.commands.length === 0)
}

// ---------------------------------------------------------------------------
// Command policy
// ---------------------------------------------------------------------------

/**
 * Returns true if `commandDotPath` is permitted under the given policy.
 *
 * Matching rules:
 * - No policy (or empty policy) → always allowed
 * - `allowed` list → command must match at least one entry
 * - `blocked` list → command must NOT match any entry
 * - Entries ending with `.*` match any command whose dot-path starts with the prefix
 *   (e.g. `elasticsearch.*` matches `elasticsearch.search` but NOT `elasticsearch` itself)
 * - All other entries are exact matches
 */
export function isCommandAllowed (commandDotPath: string, policy: CommandPolicy | undefined): boolean {
  if (policy == null) return true

  function matches (pattern: string): boolean {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2)
      return commandDotPath === prefix + '.' + commandDotPath.slice(prefix.length + 1) &&
        commandDotPath.startsWith(prefix + '.')
    }
    return commandDotPath === pattern
  }

  if (policy.profile != null) {
    const profilePolicy = resolveBuiltinProfile(policy.profile)
    if (profilePolicy != null) {
      if (!profilePolicy.allowed.some(matches)) return false
    }
    if (policy.blocked != null) return !policy.blocked.some(matches)
    return true
  }

  if (policy.allowed != null) return policy.allowed.some(matches)
  if (policy.blocked != null) return !policy.blocked.some(matches)
  return true
}

/**
 * Walk the command tree and hide any commands the policy blocks.
 * Groups where every child is hidden are hidden too.
 * Stub groups (unloaded lazy namespaces) are never hidden.
 * Call on the root program so dot-paths like `es.cat.health` are built correctly.
 */
export function hideBlockedCommands (root: OpaqueCommandHandle, policy: CommandPolicy | undefined, prefix = ''): void {
  if (policy == null) return
  for (const child of root.commands as OpaqueCommandHandle[]) {
    const path = prefix ? `${prefix}.${child.name()}` : child.name()
    const subs = child.commands as OpaqueCommandHandle[]
    if (subs.length > 0) {
      hideBlockedCommands(child, policy, path)
      if (subs.every(isHidden)) setHidden(child, true)
    } else if (!isStubGroup(child)) {
      setHidden(child, !isCommandAllowed(path, policy))
    }
  }
}

// ---------------------------------------------------------------------------
// Transport metadata stripping
// ---------------------------------------------------------------------------

/**
 * Recursively removes `found_in` keys from a JSON value tree.
 *
 * `found_in` is internal routing metadata used by the request builder to classify
 * parameters as path, query, or body. It is an HTTP transport implementation detail
 * and MUST NOT be exposed in user-facing help text or agent-facing JSON Schema output.
 */
export function stripTransportMeta (value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stripTransportMeta)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'found_in') continue
      out[k] = stripTransportMeta(v)
    }
    return out
  }
  return value
}

// ---------------------------------------------------------------------------
// Help formatting
// ---------------------------------------------------------------------------

/**
 * Returns true when `--json` is set on the root program. Walks up the parent
 * chain so it works regardless of whether `cmd` is the root, a group, or a leaf.
 */
export function hasGlobalJsonFlag (cmd: OpaqueCommandHandle): boolean {
  let current: OpaqueCommandHandle = cmd
  while (current.parent != null) current = current.parent
  return (current.opts() as { json?: boolean }).json === true
}

/** Builds the full command path by walking the parent chain (e.g. `"elastic cluster health"`). */
export function commandPath (cmd: OpaqueCommandHandle): string {
  const parts: string[] = []
  let current: OpaqueCommandHandle | null = cmd
  while (current != null) {
    if (current.name()) parts.unshift(current.name())
    current = current.parent
  }
  return parts.join(' ')
}

/**
 * Serialises a command's help structure as JSON: name, description, usage,
 * visible options, and visible sub-commands. Used by {@link configureJsonHelp}
 * so `--help --json` returns machine-readable output for groups and the root
 * program (leaf commands with an input schema return the JSON Schema instead).
 */
function formatHelpAsJson (cmd: OpaqueCommandHandle): string {
  const options = cmd.options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((o: any) => !o.hidden)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((o: any) => {
      const entry: Record<string, JsonValue> = { flags: o.flags, description: o.description }
      if (typeof o.defaultValue === 'string' || typeof o.defaultValue === 'number' || typeof o.defaultValue === 'boolean') {
        entry['defaultValue'] = o.defaultValue
      }
      if (o.mandatory === true) entry['mandatory'] = true
      return entry
    })
  const commands = (cmd.commands as OpaqueCommandHandle[])
    .filter(c => !isHidden(c) && c.name() !== 'help')
    .map(c => {
      const entry: Record<string, JsonValue> = { name: c.name(), description: c.description() }
      const aliases = c.aliases()
      if (aliases.length > 0) entry['aliases'] = aliases
      return entry
    })
  return JSON.stringify({ name: cmd.name(), description: cmd.description(), usage: cmd.usage(), options, commands }) + '\n'
}

/**
 * Hooks into Commander's help formatter so `--help --json` emits structured
 * JSON describing the command tree (name, description, options, sub-commands)
 * instead of the text help. Apply to the root program and to command groups.
 */
export function configureJsonHelp (cmd: OpaqueCommandHandle): void {
  const origHelp = cmd.createHelp()
  cmd.configureHelp({
    formatHelp: (thisCmd, helper) => {
      if (hasGlobalJsonFlag(thisCmd)) return formatHelpAsJson(thisCmd)
      return origHelp.formatHelp(thisCmd, helper)
    }
  })
}

/**
 * Configures a command's error output to match the factory error contract:
 *
 * ```
 * Error: <message>
 *
 * Usage: <command-path> <usage-suffix>
 *
 * Run "<command-path> --help" for more information.
 * ```
 */
export function configureErrorOutput (cmd: OpaqueCommandHandle): void {
  cmd.configureOutput({
    outputError: (str, write) => {
      const msg = str.replace(/^error:\s*/i, '').trimEnd()
      const path = commandPath(cmd)
      write(`Error: ${msg}\n\nUsage: ${path} ${cmd.usage()}\n\nRun "${path} --help" for more information.\n`)
    }
  })
}

// ---------------------------------------------------------------------------
// Group definition
// ---------------------------------------------------------------------------

/**
 * Creates a new command group (namespace) that contains sub-commands.
 *
 * Groups are non-leaf nodes in the command tree. They display `--help` listing
 * their children and error on unknown sub-commands.
 *
 * @example
 * ```ts
 * const esGroup = defineGroup(
 *   { name: 'es', description: 'Elasticsearch APIs' },
 *   searchCmd,
 *   indexCmd,
 * )
 * ```
 */
export function defineGroup (config: GroupConfig, ...commands: OpaqueCommandHandle[]): OpaqueCommandHandle {
  validateName(config.name, 'group')
  const group = new Command(config.name)
  group.description(config.description)
  group.allowExcessArguments(true)
  configureErrorOutput(group)
  configureJsonHelp(group)

  // Mark as a group so isStubGroup can identify lazy placeholders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(group as unknown as any)._isGroup = true

  for (const cmd of commands) {
    group.addCommand(cmd)
  }

  // Default action: error on unknown sub-command, show help otherwise
  group.action(function (this: OpaqueCommandHandle) {
    if (this.args.length > 0) {
      group.error(`unknown command: ${this.args[0]}`)
    } else {
      group.help()
    }
  })

  return group
}
