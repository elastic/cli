/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { z } from 'zod'
import type { ResolvedConfig } from './config/types.ts'
import { getResolvedConfig } from './config/store.ts'

/** pre-built schema for coercing string → number, reused per option invocation */
const numberSchema = z.coerce.number()

/**
 * Declarative definition of a named option or boolean flag for a command.
 *
 * @example
 * ```ts
 * const opt: OptionDefinition = {
 *   long: 'timeout',
 *   short: 't',
 *   type: 'number',
 *   description: 'Request timeout in seconds',
 *   defaultValue: 30,
 * }
 * ```
 */
export interface OptionDefinition {
  /** long option name without `--` prefix (e.g. `'timeout'`, `'dry-run'`) */
  long: string
  /** single-character short alias without `-` prefix (e.g. `'t'`) */
  short?: string
  /** human-readable description shown in help text */
  description: string
  /**
   * declared value type; governs parsing, coercion, and help text placeholder.
   * defaults to `'string'` when omitted.
   */
  type?: 'string' | 'number' | 'boolean'
  /** when `true`, the command will not invoke the handler if this option is absent */
  required?: boolean
  /**
   * default value used when the option is not provided.
   * type must match the declared `type` field.
   */
  defaultValue?: string | number | boolean
}

/**
 * Typed output of option parsing passed to the command handler.
 * Options are keyed by their `long` name and coerced to their declared types.
 *
 * @example
 * ```ts
 * handler: (parsed: ParsedResult) => {
 *   const verbose = parsed.options['verbose'] as boolean
 *   const timeout = parsed.options['timeout'] as number
 * }
 * ```
 */
export interface ParsedResult {
  /** parsed and type-coerced options, keyed by long option name */
  options: Record<string, string | number | boolean>
  /** resolved configuration from the active context, injected by the preAction hook */
  config?: ResolvedConfig
}

/**
 * Declarative configuration for a leaf command (a command that has a handler and accepts options).
 *
 * @example
 * ```ts
 * const config: CommandConfig = {
 *   name: 'health',
 *   description: 'Check cluster health status',
 *   options: [
 *     { long: 'verbose', short: 'v', type: 'boolean', description: 'Show detailed output' },
 *     { long: 'timeout', short: 't', type: 'number', description: 'Timeout in seconds', defaultValue: 30 },
 *   ],
 *   handler: (parsed) => { console.log(parsed.options) },
 * }
 * ```
 */
export interface CommandConfig {
  /** command name (lowercase alphanumeric and hyphens only, e.g. `'health'`, `'dry-run'`) */
  name: string
  /** human-readable description shown in help text */
  description: string
  /** option and flag definitions; all inputs are named options — positional arguments are not supported */
  options?: OptionDefinition[]
  /**
   * invoked after successful parsing and type coercion.
   * errors thrown here propagate to the caller; the factory does not catch handler errors.
   */
  handler: (parsed: ParsedResult) => void | Promise<void>
}

/**
 * Declarative configuration for a command group (a non-leaf command that contains child commands).
 *
 * @example
 * ```ts
 * const config: GroupConfig = {
 *   name: 'cluster',
 *   description: 'Manage Elasticsearch clusters',
 * }
 * ```
 */
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
 * via `program.addCommand(handle)`. Do not depend on the internal structure of this type —
 * the underlying implementation may change without notice.
 */
export type OpaqueCommandHandle = import('commander').Command

/** converts a kebab-case option name to camelCase to match Commander's opts() keys */
function camelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** valid command/group name: non-empty, lowercase alphanumeric characters and hyphens only */
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

/**
 * Validates a command or group name against the data-model rules.
 * @throws {Error} if the name is empty or contains invalid characters
 */
function validateName(name: string, kind: 'command' | 'group'): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `invalid ${kind} name ${JSON.stringify(name)}: ` +
      'names must be non-empty and contain only lowercase letters, digits, and hyphens'
    )
  }
}

/**
 * Validates all option definitions for a command.
 * @throws {Error} on short alias length, long name length, or duplicate name violations
 */
function validateOptions(options: OptionDefinition[]): void {
  const seenLong = new Set<string>()
  const seenShort = new Set<string>()

  for (const opt of options) {
    if (opt.long.length < 2) {
      throw new Error(
        `invalid option long name ${JSON.stringify(opt.long)}: long names must be at least 2 characters`
      )
    }
    if (opt.short !== undefined && opt.short.length !== 1) {
      throw new Error(
        `invalid short alias ${JSON.stringify(opt.short)} for --${opt.long}: ` +
        'short aliases must be exactly one character'
      )
    }
    if (seenLong.has(opt.long)) {
      throw new Error(`duplicate option long name: --${opt.long}`)
    }
    seenLong.add(opt.long)

    if (opt.short !== undefined) {
      if (seenShort.has(opt.short)) {
        throw new Error(`duplicate option short alias: -${opt.short}`)
      }
      seenShort.add(opt.short)
    }
  }
}

/** builds the full command path by walking the parent chain (e.g. `"elastic cluster health"`) */
function commandPath(cmd: OpaqueCommandHandle): string {
  const parts: string[] = []
  let current: OpaqueCommandHandle | null = cmd
  while (current != null) {
    if (current.name()) parts.unshift(current.name())
    current = current.parent as OpaqueCommandHandle | null
  }
  return parts.join(' ')
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
 *
 * Using `outputError` (rather than `writeErr`) ensures the formatting persists
 * even when callers subsequently override `writeErr` for output capture.
 */
function configureErrorOutput(cmd: OpaqueCommandHandle): void {
  cmd.configureOutput({
    outputError: (str, write) => {
      const msg = str.replace(/^error:\s*/i, '').trimEnd()
      const path = commandPath(cmd)
      write(`Error: ${msg}\n\nUsage: ${path} ${cmd.usage()}\n\nRun "${path} --help" for more information.\n`)
    },
  })
}

/**
 * Creates a leaf command from a declarative config and returns an opaque handle.
 *
 * The returned handle can be:
 * - registered with the CLI program via `program.addCommand(handle)`
 * - added to a command group via {@link defineGroup}
 *
 * **Lifecycle** (on invocation):
 * 1. Commander parses raw argv into typed option values
 * 2. Number options are coerced and validated via Zod; errors exit before the handler
 * 3. Required option absence is detected by Commander; exits with a structured error
 * 4. Handler is invoked with a {@link ParsedResult} containing the coerced options map
 *
 * @example
 * ```ts
 * const healthCmd = defineCommand({
 *   name: 'health',
 *   description: 'Check cluster health status',
 *   options: [
 *     { long: 'verbose', short: 'v', type: 'boolean', description: 'Show detailed output' },
 *     { long: 'timeout', type: 'number', description: 'Timeout in seconds', defaultValue: 30 },
 *   ],
 *   handler: (parsed) => {
 *     // parsed.options['verbose'] is boolean
 *     // parsed.options['timeout'] is number (default: 30)
 *   },
 * })
 * ```
 */
export function defineCommand(config: CommandConfig): OpaqueCommandHandle {
  validateName(config.name, 'command')
  validateOptions(config.options ?? [])
  const cmd = new Command(config.name)
  cmd.description(config.description)
  configureErrorOutput(cmd)

  // EXTENSION POINT: output formatting (Principle II)
  // Future: inspect config for a `format?: 'text' | 'json'` field and configure
  // a global output serialiser here, before any option registration.

  const optDefs = config.options ?? []

  for (const opt of optDefs) {
    const flag = opt.short != null
      ? `-${opt.short}, --${opt.long}`
      : `--${opt.long}`

    const register = opt.required === true ? cmd.requiredOption.bind(cmd) : cmd.option.bind(cmd)

    if (opt.type === 'boolean') {
      register(flag, opt.description)
    } else if (opt.type === 'number') {
      // <number> placeholder communicates type in help text; parseArg coerces and validates inline
      const flagWithArg = `${flag} <number>`
      const parseArg = (val: string): number => {
        const result = numberSchema.safeParse(val)
        if (!result.success) {
          cmd.error(`option --${opt.long}: expected a number, got: ${val}`)
        }
        return result.data!
      }
      register(flagWithArg, opt.description, parseArg, opt.defaultValue as number | undefined)
    } else {
      // string options: <string> placeholder communicates type in help text
      register(`${flag} <string>`, opt.description, opt.defaultValue !== undefined ? String(opt.defaultValue) : undefined)
    }
  }

  // EXTENSION POINT: JSON Schema generation (Principle II)
  // Future: derive a JSON Schema from `optDefs` here and attach it to the command
  // handle so `--help --format=json` can emit machine-readable schema.

  cmd.action(async () => {
    // EXTENSION POINT: context-based configuration (Principle IV)
    // Future: resolve environment/profile config here and merge with parsed options
    // before passing to the handler, without changing the CommandConfig interface.

    // EXTENSION POINT: authentication (cross-cutting)
    // Future: check a `requiresAuth?: boolean` field in config and inject credentials
    // into the parsed result or reject with a structured error before the handler runs.

    // EXTENSION POINT: dry-run (Principle III)
    // Future: inspect a global `--dry-run` flag (registered by the factory on every
    // command) and short-circuit handler invocation, printing what would happen instead.

    const raw = cmd.opts()
    const options: Record<string, string | number | boolean> = {}

    for (const opt of optDefs) {
      const rawKey = camelCase(opt.long)
      const rawVal = raw[rawKey]

      if (opt.type === 'boolean') {
        options[opt.long] = rawVal === true
      } else if (rawVal !== undefined) {
        // number coercion already done by parseArg; string values passed through as-is
        options[opt.long] = rawVal as string | number
      }
    }

    const resolvedConfig = getResolvedConfig()
    const parsed: ParsedResult = resolvedConfig != null
      ? { options, config: resolvedConfig }
      : { options }
    await config.handler(parsed)
  })

  return cmd
}

/**
 * Creates a command group from a declarative config, attaching child command handles.
 * Returns an opaque handle registerable with the CLI program or a parent group.
 *
 * **Behaviour**:
 * - When invoked without a sub-command: displays group-level help and exits cleanly (code 0)
 * - When invoked with an unrecognised sub-command: emits a structured error message
 * - When invoked with a known sub-command: dispatches to that command's handler
 *
 * @example
 * ```ts
 * const healthCmd = defineCommand({ name: 'health', ... })
 * const statsCmd  = defineCommand({ name: 'stats',  ... })
 *
 * const clusterGroup = defineGroup(
 *   { name: 'cluster', description: 'Manage Elasticsearch clusters' },
 *   healthCmd,
 *   statsCmd,
 * )
 * ```
 */
export function defineGroup(config: GroupConfig, ...commands: OpaqueCommandHandle[]): OpaqueCommandHandle {
  validateName(config.name, 'group')
  const group = new Command(config.name)
  group.description(config.description)
  group.allowExcessArguments(true)
  configureErrorOutput(group)
  for (const cmd of commands) {
    group.addCommand(cmd)
  }
  // when invoked without a sub-command: show help (exit 0);
  // when invoked with an unrecognised sub-command: emit a clear error
  group.action(function (this: OpaqueCommandHandle) {
    if (this.args.length > 0) {
      group.error(`unknown command: ${this.args[0]}`)
    } else {
      group.help()
    }
  })
  return group
}
