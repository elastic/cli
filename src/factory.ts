/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import type { ResolvedConfig, CommandPolicy } from './config/types.ts'
import { getResolvedConfig } from './config/store.ts'
import { extractSchemaArgs, validateSchemaArgs } from './lib/schema-args.ts'
import type { SchemaArgDefinition } from './lib/schema-args.ts'
import { renderText } from './output.ts'

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
  /** long option name without `--` prefix (e.g. `'timeout'`, `'output-dir'`) */
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
 * Any value that can be round-tripped through `JSON.stringify` / `JSON.parse` without loss.
 * All command handlers must return a `JsonValue`; the factory serializes it for output.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Typed output of option parsing passed to the command handler.
 * Options are keyed by their `long` name and coerced to their declared types.
 *
 * The generic parameter `T` carries the validated input type when a Zod schema is provided
 * via {@link CommandConfig.input}. Defaults to `unknown` when no schema is used.
 *
 * @example
 * ```ts
 * const schema = z.object({ index: z.string(), size: z.number().default(10) })
 * defineCommand({
 *   name: 'search',
 *   input: schema,
 *   handler: (parsed: ParsedResult<z.infer<typeof schema>>) => {
 *     // parsed.input is { index: string; size: number } -- fully typed
 *   },
 * })
 * ```
 */
export interface ParsedResult<T = unknown> {
  /** parsed and type-coerced options, keyed by long option name */
  options: Record<string, string | number | boolean>
  /** resolved configuration from the active context, injected by the preAction hook */
  config?: ResolvedConfig
  /** parsed JSON content when `input` is enabled and data is provided via --input-file or stdin */
  input?: T
}

/**
 * Declarative configuration for a leaf command (a command that has a handler and accepts options).
 *
 * When `input` is a Zod schema of type `T`, `CommandConfig` is generic over `T` and the handler
 * receives a strongly-typed `ParsedResult<z.infer<T>>`. When `input` is omitted, the handler
 * receives `ParsedResult` with `input` typed as `unknown`.
 *
 * @example
 * ```ts
 * const inputSchema = z.object({ index: z.string(), size: z.number().default(10) })
 * const searchCmd: CommandConfig<typeof inputSchema> = {
 *   name: 'search',
 *   description: 'Search an index',
 *   input: inputSchema,
 *   handler: (parsed) => {
 *     // parsed.input is { index: string; size: number }
 *   },
 * }
 * ```
 */
export interface CommandConfig<T extends z.ZodType = z.ZodType> {
  /** command name (lowercase alphanumeric and hyphens only, e.g. `'health'`, `'dry-run'`) */
  name: string
  /** human-readable description shown in help text */
  description: string
  /** option and flag definitions; all inputs are named options - positional arguments are not supported */
  options?: OptionDefinition[]
  /**
   * invoked after successful parsing and type coercion.
   * errors thrown here propagate to the caller; the factory does not catch handler errors.
   */
  handler: (parsed: ParsedResult<z.infer<T>>) => JsonValue | Promise<JsonValue>
  /**
   * optional input schema. when a Zod schema is provided, registers `--input-file` and reads JSON from
   * stdin or file, validates against the schema, then passes the typed result to the handler.
   */
  input?: T
  /**
   * optional text renderer for non-JSON output mode.
   * when provided, called with the handler result and the full parsed result to produce a string
   * written to stdout. when omitted, the factory auto-renders via {@link renderText}.
   * never called when `--format=json` is active.
   */
  formatOutput?: (result: JsonValue, parsed: ParsedResult<z.infer<T>>) => string
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
 * via `program.addCommand(handle)`. Do not depend on the internal structure of this type --
 * the underlying implementation may change without notice.
 */
export type OpaqueCommandHandle = import('commander').Command

/**
 * Module-level stdin reader - swappable in tests via {@link _testSetStdinReader}.
 * Production default reads all of stdin synchronously using file descriptor 0,
 * which works cross-platform (Windows, Linux, macOS).
 */
let stdinReader: () => string = () => readFileSync(0, 'utf-8')

/**
 * Test-only seam: replaces the stdin reader with `fn` and returns a restore callback.
 * Always call the returned function in a `finally` block to avoid test pollution.
 *
 * @internal not part of the public API
 */
export function _testSetStdinReader (fn: () => string): () => void {
  const prev = stdinReader
  stdinReader = fn
  return () => { stdinReader = prev }
}

/**
 * Returns true if `commandDotPath` is permitted under the given policy.
 *
 * Matching rules:
 * - No policy (or empty policy) → always allowed
 * - `allowed` list → command must match at least one entry
 * - `blocked` list → command must NOT match any entry
 * - Entries ending with `.*` match any command whose dot-path starts with the prefix and a `.`
 *   (e.g. `elasticsearch.*` matches `elasticsearch.search` and `elasticsearch.indices.get`
 *    but NOT `elasticsearch` itself)
 * - All other entries are exact matches
 */
export function isCommandAllowed(commandDotPath: string, policy: CommandPolicy | undefined): boolean {
  if (policy == null) return true

  function matches(pattern: string): boolean {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2)
      return commandDotPath === prefix + '.' + commandDotPath.slice(prefix.length + 1) &&
        commandDotPath.startsWith(prefix + '.')
    }
    return commandDotPath === pattern
  }

  if (policy.allowed != null) return policy.allowed.some(matches)
  if (policy.blocked != null) return !policy.blocked.some(matches)
  return true
}

// Commander checks `_hidden` to exclude commands from --help, but the
// property isn't in the public typings —
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setHidden(cmd: OpaqueCommandHandle, value: boolean): void { (cmd as unknown as any)._hidden = value }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isHidden(cmd: OpaqueCommandHandle): boolean { return (cmd as unknown as any)._hidden === true }

/**
 * Walk the command tree and hide any commands the policy blocks.
 * Groups where every child is hidden are hidden too.
 * Call on the root program so dot-paths like `es.cat.health` are built correctly.
 */
export function hideBlockedCommands(root: OpaqueCommandHandle, policy: CommandPolicy | undefined, prefix = ''): void {
  if (policy == null) return
  for (const child of root.commands as OpaqueCommandHandle[]) {
    const path = prefix ? `${prefix}.${child.name()}` : child.name()
    const subs = child.commands as OpaqueCommandHandle[]
    if (subs.length > 0) {
      hideBlockedCommands(child, policy, path)
      if (subs.every(isHidden)) setHidden(child, true)
    } else {
      setHidden(child, !isCommandAllowed(path, policy))
    }
  }
}

/** converts a kebab-case option name to camelCase to match Commander's opts() keys */
function camelCase (s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** valid command/group name: non-empty, lowercase alphanumeric characters and hyphens only */
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

/**
 * Validates a command or group name against the data-model rules.
 * @throws {Error} if the name is empty or contains invalid characters
 */
function validateName (name: string, kind: 'command' | 'group'): void {
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
function validateOptions (options: OptionDefinition[]): void {
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

    if (opt.long === 'dry-run') {
      throw new Error('option --dry-run is reserved')
    }

    if (opt.short !== undefined) {
      if (seenShort.has(opt.short)) {
        throw new Error(`duplicate option short alias: -${opt.short}`)
      }
      seenShort.add(opt.short)
    }
  }
}

/**
 * Validates the `input` field of a {@link CommandConfig} at definition time.
 * @throws {Error} if `input` is defined but is not a `z.ZodType` instance
 */
function validateInput (name: string, input: unknown): void {
  if (input !== undefined && !(input instanceof z.ZodType)) {
    throw new Error(`command ${JSON.stringify(name)}: input must be a Zod schema`)
  }
}

/**
 * Configures help output for a command to conditionally emit JSON Schema.
 *
 * When `--json` is present in the parsed global options and the command has an
 * input schema, help is replaced with the raw JSON Schema object so agents can
 * parse it directly. Commands without an input schema print nothing in that mode.
 * Without `--json`, standard human-readable help is printed with no schema appended.
 */

/**
 * Recursively removes `found_in` keys from a JSON Schema object.
 *
 * `found_in` is internal routing metadata used by the request builder to classify
 * parameters as path, query, or body. It is an HTTP transport implementation detail
 * and MUST NOT be exposed in user-facing help text or agent-facing JSON Schema output
 * (Constitution Principle VIII: Transport-Layer Abstraction).
 */
function stripTransportMeta (value: JsonValue): JsonValue {
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
function configureHelpWithSchema (cmd: OpaqueCommandHandle, inputSchema?: z.ZodType): void {
  const origHelp = cmd.createHelp()
  cmd.configureHelp({
    formatHelp: (thisCmd, helper) => {
      const globalOpts = thisCmd.parent?.optsWithGlobals()
      if (globalOpts?.json === true) {
        const jsonSchema = inputSchema != null
          ? stripTransportMeta(z.toJSONSchema(inputSchema, { reused: 'ref' }) as JsonValue)
          : undefined
        return jsonSchema != null ? JSON.stringify(jsonSchema) + '\n' : ''
      }
      return origHelp.formatHelp(thisCmd, helper)
    }
  })
}

/** builds the full command path by walking the parent chain (e.g. `"elastic cluster health"`) */
function commandPath (cmd: OpaqueCommandHandle): string {
  const parts: string[] = []
  let current: OpaqueCommandHandle | null = cmd
  while (current != null) {
    if (current.name()) parts.unshift(current.name())
    current = current.parent
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
function configureErrorOutput (cmd: OpaqueCommandHandle): void {
  cmd.configureOutput({
    outputError: (str, write) => {
      const msg = str.replace(/^error:\s*/i, '').trimEnd()
      const path = commandPath(cmd)
      write(`Error: ${msg}\n\nUsage: ${path} ${cmd.usage()}\n\nRun "${path} --help" for more information.\n`)
    }
  })
}

/**
 * Parses `raw` as JSON, routing errors through Commander's error handler.
 * `source` is the error prefix shown to the user (e.g. `'--input-file'` or `'stdin'`).
 * Returns `never` on any error path via `cmd.error()`.
 */
function parseJsonContent (raw: string, source: string, cmd: OpaqueCommandHandle): unknown {
  if (raw.trim().length === 0) {
    return cmd.error(`${source}: invalid JSON: empty content`)
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    return cmd.error(`${source}: invalid JSON: ${(e as SyntaxError).message}`)
  }
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
 * 4. If `input` is a Zod schema and JSON data is provided, it is validated via `safeParse`;
 *    on failure, an error is emitted and the handler is never invoked
 * 5. Handler is invoked with a {@link ParsedResult} containing coerced options and typed input
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
export function defineCommand<T extends z.ZodType> (config: CommandConfig<T>): OpaqueCommandHandle {
  validateName(config.name, 'command')
  validateOptions(config.options ?? [])
  validateInput(config.name, config.input)
  // --input-file is reserved when input is a schema; catch collision at definition time
  if (config.input instanceof z.ZodType && config.options?.some((o) => o.long === 'input-file')) {
    throw new Error(
      `command ${JSON.stringify(config.name)}: option --input-file is reserved when input is enabled`
    )
  }
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

  // schema-derived CLI options (registered before --input-file so help text order is correct)
  let schemaArgs: SchemaArgDefinition[] = []
  if (config.input instanceof z.ZodType) {
    schemaArgs = extractSchemaArgs(config.input)
    validateSchemaArgs(schemaArgs)
    for (const arg of schemaArgs) {
      const suffix = arg.required
        ? '(required)'
        : arg.defaultValue !== undefined ? `(default: ${JSON.stringify(arg.defaultValue)})` : undefined
      const desc = [arg.description, suffix].filter(Boolean).join(' ')
      if (arg.type === 'boolean') {
        // booleans omit the suffix; flag-style convention makes it clear
        cmd.option(`--${arg.cliFlag} [value]`, arg.description)
      } else if (arg.type === 'number') {
        const parseNum = (val: string): number => {
          const r = numberSchema.safeParse(val)
          if (!r.success) cmd.error(`option --${arg.cliFlag}: expected a number, got: ${val}`)
          return r.data!
        }
        cmd.option(`--${arg.cliFlag} <number>`, desc, parseNum)
      } else if (arg.type === 'object' || arg.type === 'array') {
        cmd.option(`--${arg.cliFlag} <json>`, desc)
      } else if (arg.type === 'enum') {
        cmd.option(`--${arg.cliFlag} <value>`, desc)
      } else {
        // string: passed through as-is, no coercion
        cmd.option(`--${arg.cliFlag} <string>`, desc)
      }
    }
  }
  if (config.input instanceof z.ZodType) {
    cmd.option('--input-file <path>', 'path to a JSON file to use as command input')
  }
  const schemaClaimsDryRun = schemaArgs.some((a) => a.cliFlag === 'dry-run')
  if (!schemaClaimsDryRun) {
    cmd.option('--dry-run', 'validate all inputs and exit without performing any action')
  }

  configureHelpWithSchema(cmd, config.input instanceof z.ZodType ? config.input : undefined)

  cmd.action(async () => {
    const allRaw = cmd.optsWithGlobals()
    const options: Record<string, string | number | boolean> = {}

    for (const opt of optDefs) {
      const rawKey = camelCase(opt.long)
      const rawVal = allRaw[rawKey]
      if (opt.type === 'boolean') {
        options[opt.long] = rawVal === true
      } else if (rawVal !== undefined) {
        // number coercion already done by parseArg; string values passed through as-is
        options[opt.long] = rawVal as string | number
      }
    }

    const declaredKeys = new Set(optDefs.map((o) => camelCase(o.long)))
    for (const [camelKey, val] of Object.entries(allRaw)) {
      if (!declaredKeys.has(camelKey) && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
        const kebabKey = camelKey.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
        options[kebabKey] = val
      }
    }

    const jsonFormat = allRaw.json
    let inputValue: unknown
    if (config.input instanceof z.ZodType) {
      const filePath = cmd.getOptionValue('inputFile') as string | undefined
      if (filePath !== undefined && !process.stdin.isTTY) {
        return cmd.error('cannot read input from both --input-file and stdin; provide one or the other')
      }
      if (filePath !== undefined) {
        let fileContent: string
        try {
          fileContent = readFileSync(filePath, 'utf-8')
        } catch {
          return cmd.error(`--input-file: file not found: ${filePath}`)
        }
        inputValue = parseJsonContent(fileContent, '--input-file', cmd)
      } else if (!process.stdin.isTTY) {
        const raw = stdinReader()
        if (raw.trim().length > 0) {
          inputValue = parseJsonContent(raw, 'stdin', cmd)
        }
      }

      // collect explicitly-provided schema-derived CLI arguments and merge over JSON input
      const cliInput: Record<string, unknown> = {}
      for (const arg of schemaArgs) {
        // Commander stores kebab-case flags as camelCase keys in opts()
        const camelKey = camelCase(arg.cliFlag)
        const raw = allRaw[camelKey]
        if (raw === undefined) continue
        // boolean coercion: --flag (no value) -> true, --flag false -> false
        if (arg.type === 'boolean') {
          cliInput[arg.schemaKey] = raw !== 'false'
        } else if (arg.type === 'object' || arg.type === 'array') {
          try {
            cliInput[arg.schemaKey] = JSON.parse(raw as string)
          } catch {
            return cmd.error(`option --${arg.cliFlag}: invalid JSON: ${raw}`)
          }
        } else {
          // string, number (already coerced by parseArg), enum
          cliInput[arg.schemaKey] = raw
        }
      }
      if (Object.keys(cliInput).length > 0) {
        inputValue = { ...(inputValue as Record<string, unknown> ?? {}), ...cliInput }
      }
    }

    const resolvedConfig = getResolvedConfig()

    // enforce command policy before any other work
    if (resolvedConfig?.commands != null) {
      // commandPath returns e.g. "elastic elasticsearch search"; strip root program name and dot-join
      const parts = commandPath(cmd).split(' ')
      // if mounted under a root program (e.g. "elastic"), strip that first segment
      const dotPath = (parts.length > 1 ? parts.slice(1) : parts).join('.')
      if (!isCommandAllowed(dotPath, resolvedConfig.commands)) {
        if (jsonFormat === true) {
          process.stdout.write(JSON.stringify({
            error: {
              code: 'command_blocked',
              message: `command "${dotPath}" is not allowed by the current policy`,
            },
          }) + '\n')
          throw Object.assign(new Error('command_blocked'), { exitCode: 1 })
        }
        return cmd.error(`command "${dotPath}" is not allowed by the current policy`)
      }
    }

    const parsed: ParsedResult<z.infer<T>> = {
      options,
      ...(resolvedConfig != null ? { config: resolvedConfig } : {})
    }
    if (inputValue !== undefined) {
      assert(config.input instanceof z.ZodType, `command ${JSON.stringify(config.name)}: input must be a Zod schema`)
      // apply strict mode to reject unknown keys, unless the author explicitly used .passthrough()
      const validationSchema = (
        config.input instanceof z.ZodObject &&
        (config.input.def as unknown as { catchall?: { type: string } }).catchall?.type !== 'unknown'
      )
        ? config.input.strict()
        : config.input
      const result = validationSchema.safeParse(inputValue)
      if (result.success) {
        parsed.input = result.data as z.infer<T>
      } else {
        if (jsonFormat === true) {
          const issues = result.error.issues
          process.stdout.write(JSON.stringify({
            error: {
              code: 'input_validation_failed',
              message: `Input validation failed with ${issues.length} issue(s)`,
              issues
            }
          }) + '\n')
          // throw to prevent handler execution - mirrors cmd.error() behaviour
          throw Object.assign(new Error('input_validation_failed'), { exitCode: 1 })
        }
        return cmd.error(`input validation failed:\n${z.prettifyError(result.error)}`)
      }
    }
    if (allRaw['dryRun'] === true) {
      if (jsonFormat) {
        process.stdout.write(JSON.stringify({ success: true }) + '\n')
      }
      return
    }
    const handlerResult = await config.handler(parsed)
    assert(handlerResult !== undefined, `command ${JSON.stringify(config.name)}: handler must return a JsonValue`)
    if (jsonFormat === true) {
      process.stdout.write(JSON.stringify(handlerResult) + '\n')
    } else if (config.formatOutput !== undefined) {
      process.stdout.write(config.formatOutput(handlerResult, parsed))
    } else {
      process.stdout.write(renderText(handlerResult))
    }
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
export function defineGroup (config: GroupConfig, ...commands: OpaqueCommandHandle[]): OpaqueCommandHandle {
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
