/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import type { z } from 'zod'
import { createRequire } from 'node:module'
import { readFileSync, writeSync } from 'node:fs'
import assert from 'node:assert/strict'
import { getResolvedConfig } from './config/store.ts'
import { extractSchemaArgs, validateSchemaArgs } from './lib/schema-args.ts'
import type { SchemaArgDefinition } from './lib/schema-args.ts'
import type { renderText as _RT, formatHandlerError as _FHE } from './output.ts'
import { pickFields, parseFieldList, applyTemplate, TemplateAgainstPrimitiveError } from './lib/output-transform.ts'
import { validateName, hasGlobalJsonFlag, configureErrorOutput, commandPath, isCommandAllowed, stripTransportMeta } from './factory-core.ts'
import type { OpaqueCommandHandle, JsonValue, CommandConfig, ParsedResult } from './factory-core.ts'
import { RawJsonValue } from './factory-core.ts'

// Re-export from factory-core for backward compatibility
export {
  type CommandIntent,
  type OptionDefinition,
  type JsonValue,
  RawJsonValue,
  type ParsedResult,
  type CommandConfig,
  type GroupConfig,
  type OpaqueCommandHandle,
  isCommandAllowed,
  hideBlockedCommands,
  stripTransportMeta,
  configureJsonHelp,
  defineGroup,
  setHidden,
  isHidden,
  validateName,
  commandPath,
  configureErrorOutput,
} from './factory-core.ts'

// Lazy-loaded modules; deferred to improve performance of --help calls
const _require = createRequire(import.meta.url)
let _zMod: (typeof import('zod')) | null = null
function getZ (): typeof import('zod').z {
  if (_zMod == null) _zMod = _require('zod') as typeof import('zod')
  return _zMod.z
}

let _outputMod: Promise<{ renderText: typeof _RT; formatHandlerError: typeof _FHE }> | null = null
function getOutput () {
  if (_outputMod == null) _outputMod = import('./output.js') as unknown as typeof _outputMod
  return _outputMod!
}

let _numberSchema: ReturnType<typeof import('zod').z.coerce.number> | null = null
function numberSchema () {
  if (_numberSchema == null) _numberSchema = getZ().coerce.number()
  return _numberSchema
}

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

/** converts a kebab-case option name to camelCase to match Commander's opts() keys */
function camelCase (s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Parses an ES `Sort` CLI value into the shape ES expects in a request body.
 *
 * The CLI help text advertises the URL-query grammar (`<field>:<direction>` pairs, comma-
 * separated), but the request body needs explicit objects per pair. Bare field names (no
 * colon) are kept as strings since ES accepts them directly.
 *
 * Examples:
 *   "views"                       → "views"
 *   "views:desc"                  → [{ views: "desc" }]
 *   "views,timestamp"             → ["views", "timestamp"]
 *   "views:desc,timestamp:asc"    → [{ views: "desc" }, { timestamp: "asc" }]
 *   "views,timestamp:desc"        → ["views", { timestamp: "desc" }]
 */
function parseSortPairs (value: string): string | Array<string | Record<string, string>> {
  const parts = parseFieldList(value)
  if (parts.length === 0) return value
  const transformed = parts.map((part): string | Record<string, string> => {
    const colonIdx = part.indexOf(':')
    if (colonIdx === -1) return part
    return { [part.slice(0, colonIdx).trim()]: part.slice(colonIdx + 1).trim() }
  })
  if (transformed.length === 1 && typeof transformed[0] === 'string') return transformed[0]
  return transformed
}

/**
 * Creates a parseArg function that accumulates repeated string flag values with comma separation.
 * Uses Commander's option value source tracking: first CLI occurrence replaces any default,
 * subsequent CLI occurrences append with a comma separator.
 */
function stringAccumulator (cmd: Command, attrName: string): (value: string, previous: string | undefined) => string {
  return (value: string, previous: string | undefined): string => {
    if (cmd.getOptionValueSource(attrName) === 'cli') return `${previous},${value}`
    return value
  }
}

/**
 * Creates a parseArg function that rejects repeated flag occurrences for singular-value options.
 * Wraps an optional inner parser (e.g. number coercion) and errors via Commander
 * if the option has already been set from the CLI.
 */
function singleValueGuard<T> (
  cmd: Command, attrName: string, flagDisplay: string, innerParse?: (val: string) => T,
): (value: string, previous: T | undefined) => T {
  return (value: string): T => {
    if (cmd.getOptionValueSource(attrName) === 'cli') {
      cmd.error(`option ${flagDisplay} cannot be specified more than once`)
    }
    return innerParse != null ? innerParse(value) : value as unknown as T
  }
}

/**
 * Validates all option definitions for a command.
 * @throws {Error} on short alias length, long name length, or duplicate name violations
 */
function validateOptions (options: import('./factory-core.ts').OptionDefinition[]): void {
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
  if (input !== undefined && !(input instanceof getZ().ZodType)) {
    throw new Error(`command ${JSON.stringify(name)}: input must be a Zod schema`)
  }
}

/**
 * Configures `--help --json` on a leaf command to emit the JSON Schema derived
 * from the command's input Zod schema. Uses synchronous blocking write to prevent
 * truncation when stdout is piped.
 */
function configureHelpWithSchema (
  cmd: OpaqueCommandHandle,
  inputSchema: z.ZodType | undefined,
): void {
  const origHelp = cmd.createHelp()
  cmd.configureHelp({
    formatHelp: (thisCmd, helper) => {
      if (hasGlobalJsonFlag(thisCmd)) {
        const jsonSchema = inputSchema != null
          ? stripTransportMeta(getZ().toJSONSchema(inputSchema, { reused: 'ref' }) as JsonValue)
          : undefined
        return jsonSchema != null ? JSON.stringify(jsonSchema) + '\n' : ''
      }
      return origHelp.formatHelp(thisCmd, helper)
    }
  })
  // The JSON schema for commands like `es search` exceeds 64 KB.  Commander
  // passes the formatted string to writeOut (process.stdout.write by default),
  // which is async; process.exit() fires immediately afterwards and discards
  // the unflushed buffer, truncating the output.
  //
  // We override writeOut to write synchronously instead.  Node.js (libuv) puts
  // pipe file-descriptors into non-blocking mode once process.stdout is
  // initialised, so a bare writeSync would also stop at the pipe-buffer limit;
  // setBlocking(true) restores blocking mode first.
  cmd.configureOutput({
    writeOut: (str) => {
      ;(process.stdout as NodeJS.WriteStream & { _handle?: { setBlocking?: (b: boolean) => void } })
        ._handle?.setBlocking?.(true)
      writeSync(1, str)
    },
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

function isErrorResult (value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'error' in value &&
    typeof value.error === 'object' &&
    value.error !== null &&
    !Array.isArray(value.error) &&
    'code' in value.error &&
    typeof value.error.code === 'string'
  )
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
  if (config.input instanceof getZ().ZodType && config.options?.some((o) => o.long === 'input-file')) {
    throw new Error(
      `command ${JSON.stringify(config.name)}: option --input-file is reserved when input is enabled`
    )
  }
  const cmd = new Command(config.name)
  cmd.description(config.description)
  configureErrorOutput(cmd)

  if (config.positionalArg != null) {
    const placeholder = config.positionalArg.required !== false
      ? `<${config.positionalArg.name}>`
      : `[${config.positionalArg.name}]`
    cmd.argument(placeholder, config.positionalArg.description)
  }

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
      const attrName = camelCase(opt.long)
      const parseNum = (val: string): number => {
        const result = numberSchema().safeParse(val)
        if (!result.success) {
          cmd.error(`option --${opt.long}: expected a number, got: ${val}`)
        }
        return result.data!
      }
      register(flagWithArg, opt.description, singleValueGuard(cmd, attrName, `--${opt.long}`, parseNum), opt.defaultValue as number | undefined)
    } else {
      // string options: accumulate repeated values with comma separation
      const attrName = camelCase(opt.long)
      register(`${flag} <string>`, opt.description, stringAccumulator(cmd, attrName), opt.defaultValue !== undefined ? String(opt.defaultValue) : undefined)
    }
  }

  // schema-derived CLI options (registered before --input-file so help text order is correct)
  let schemaArgs: SchemaArgDefinition[] = []
  if (config.input instanceof getZ().ZodType) {
    schemaArgs = extractSchemaArgs(config.input)
    validateSchemaArgs(schemaArgs)
    for (const arg of schemaArgs) {
      const suffix = arg.required
        ? '(required)'
        : arg.defaultValue !== undefined ? `(default: ${JSON.stringify(arg.defaultValue)})` : undefined
      const csvNote = arg.acceptsArrayForm === true && arg.foundIn === 'body'
        ? 'Accepts a comma-separated list; use --input-file with a JSON array for values that contain commas.'
        : undefined
      const desc = [arg.description, csvNote, suffix].filter(Boolean).join(' ')
      if (arg.type === 'boolean') {
        // booleans omit the suffix; flag-style convention makes it clear
        cmd.option(`--${arg.cliFlag} [value]`, arg.description)
      } else if (arg.type === 'number') {
        const attrName = camelCase(arg.cliFlag)
        const parseNum = (val: string): number => {
          const r = numberSchema().safeParse(val)
          if (!r.success) cmd.error(`option --${arg.cliFlag}: expected a number, got: ${val}`)
          return r.data!
        }
        cmd.option(`--${arg.cliFlag} <number>`, desc, singleValueGuard(cmd, attrName, `--${arg.cliFlag}`, parseNum))
      } else if (arg.type === 'object' || arg.type === 'array') {
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <json>`, desc, singleValueGuard<string>(cmd, attrName, `--${arg.cliFlag}`))
      } else if (arg.type === 'enum') {
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <value>`, desc, singleValueGuard<string>(cmd, attrName, `--${arg.cliFlag}`))
      } else {
        // string: accumulate repeated values with comma separation
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <string>`, desc, stringAccumulator(cmd, attrName))
      }
    }
  }
  if (config.input instanceof getZ().ZodType) {
    cmd.option('--input-file <path>', 'path to a JSON file to use as command input')
  }
  const schemaClaimsDryRun = schemaArgs.some((a) => a.cliFlag === 'dry-run')
  if (!schemaClaimsDryRun) {
    cmd.option('--dry-run', 'validate all inputs and exit without performing any action')
  }

  configureHelpWithSchema(
    cmd,
    config.input instanceof getZ().ZodType ? config.input : undefined,
  )

  // Attach typed metadata for tooling (e.g. cli-schema). Non-enumerable so it
  // doesn't appear in JSON.stringify or Commander's own command inspection.
  Object.defineProperty(cmd, '_commandConfig', {
    value: { config, schemaArgs },
    writable: false,
    enumerable: false,
  })

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
    const rawBodyValues: Record<string, RawJsonValue> = {}
    if (config.input instanceof getZ().ZodType) {
      const filePath = cmd.getOptionValue('inputFile') as string | undefined
      if (filePath !== undefined) {
        let fileContent: string
        if (filePath === '-') {
          fileContent = stdinReader()
        } else {
          try {
            fileContent = readFileSync(filePath, 'utf-8')
          } catch {
            return cmd.error(`--input-file: file not found: ${filePath}`)
          }
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
            const parsed = JSON.parse(raw as string)
            cliInput[arg.schemaKey] = parsed
            if (arg.foundIn === 'body' || arg.foundIn === undefined) {
              rawBodyValues[arg.schemaKey] = new RawJsonValue(raw as string, parsed)
            }
          } catch {
            // If JSON parse fails, pass the raw value — handles z.any() fields
            // that accept plain strings (e.g. connector update-error --error)
            cliInput[arg.schemaKey] = raw
          }
        } else if (
          arg.parseStyle === 'sort-pairs' &&
          arg.foundIn === 'body' &&
          typeof raw === 'string'
        ) {
          // ES `Sort` body fields: the help text advertises `<field>:<direction>` pairs
          // (the URL query grammar), but in the request body ES expects
          // `[{"field": "direction"}, ...]`. Parse the colon syntax into that shape.
          cliInput[arg.schemaKey] = parseSortPairs(raw)
        } else if (
          arg.type === 'string' &&
          arg.acceptsArrayForm === true &&
          arg.foundIn === 'body' &&
          typeof raw === 'string' &&
          raw.includes(',')
        ) {
          // JSON bodies need an array for union(T, array(T)) fields like `fields`; ES
          // does not split CSV strings inside bodies (it only does so in path and query).
          // Users whose individual field values contain literal commas can pass a
          // pre-built JSON array via `--input-file` instead.
          cliInput[arg.schemaKey] = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        } else {
          // string, number (already coerced by parseArg), enum
          cliInput[arg.schemaKey] = raw
        }
      }
      if (Object.keys(cliInput).length > 0) {
        inputValue = { ...(inputValue as Record<string, unknown> ?? {}), ...cliInput }
      }
      // always validate against the schema, even when no input was provided,
      // so that missing required fields are caught by Zod
      if (inputValue === undefined) {
        inputValue = {}
      }
    }

    const positionalValue = config.positionalArg != null
      ? (cmd.processedArgs[0] as string | undefined)
      : undefined

    const resolvedConfig = getResolvedConfig()

    // enforce command policy before any other work
    if (resolvedConfig?.commands != null) {
      // commandPath returns e.g. "elastic elasticsearch search"; strip root program name and dot-join
      const parts = commandPath(cmd).split(' ')
      // if mounted under a root program (e.g. "elastic"), strip that first segment
      const dotPath = (parts.length > 1 ? parts.slice(1) : parts).join('.')
      if (!isCommandAllowed(dotPath, resolvedConfig.commands)) {
        if (jsonFormat === true) {
          process.stderr.write(JSON.stringify({
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
      ...(resolvedConfig != null ? { config: resolvedConfig } : {}),
      ...(positionalValue !== undefined ? { arg: positionalValue } : {})
    }
    if (inputValue !== undefined) {
      assert(config.input instanceof getZ().ZodType, `command ${JSON.stringify(config.name)}: input must be a Zod schema`)
      // Use passthrough so unknown fields (plugin-specific, newer ES versions) flow
      // through to the server instead of being rejected client-side (#170).
      let validationSchema: z.ZodType = (
        config.input instanceof getZ().ZodObject &&
        (config.input.def as unknown as { catchall?: { type: string } }).catchall?.type !== 'unknown'
      )
        ? config.input.passthrough()
        : config.input

      // Relax validation for object/array body fields. These contain user-provided
      // JSON (e.g. --query, --mappings) whose full DSL (including shorthand forms)
      // is too complex for client-side Zod schemas. The CLI already validates that the
      // JSON is syntactically correct; Elasticsearch validates the semantics server-side.
      //
      // Also relax `sort-pairs` fields: the CLI rewrites `field:direction` strings into
      // `[{field: 'direction'}]` objects, which the strict `Sort` schema (SortOptions has
      // a fixed set of reserved keys like `_score`) would otherwise reject.
      const jsonBodyFields = schemaArgs.filter(
        a => a.foundIn === 'body' &&
             (a.type === 'object' || a.type === 'array' || a.parseStyle === 'sort-pairs')
      )
      if (jsonBodyFields.length > 0 && validationSchema instanceof getZ().ZodObject) {
        const overrides: Record<string, z.ZodType> = {}
        for (const f of jsonBodyFields) {
          overrides[f.schemaKey] = f.required ? getZ().any() : getZ().any().optional()
        }
        validationSchema = (validationSchema as z.ZodObject<z.ZodRawShape>).extend(overrides)
      }

      const result = validationSchema.safeParse(inputValue)
      if (result.success) {
        parsed.input = result.data as z.infer<T>
        if (Object.keys(rawBodyValues).length > 0) {
          parsed.rawBodyValues = rawBodyValues
        }
      } else {
        const { simplifyZodIssues, formatIssuesText } = await import('./lib/zod-error.js')
        const issues = simplifyZodIssues(result.error.issues)
        if (jsonFormat === true) {
          const writeErr = cmd.configureOutput().writeErr ?? ((s: string) => process.stderr.write(s))
          writeErr(JSON.stringify({
            error: {
              code: 'input_validation_failed',
              message: `Input validation failed with ${issues.length} issue(s)`,
              issues
            }
          }) + '\n')
          // throw to prevent handler execution - mirrors cmd.error() behaviour
          throw Object.assign(new Error('input_validation_failed'), { exitCode: 1 })
        }
        return cmd.error(`input validation failed:\n${formatIssuesText(issues)}`)
      }
    }
    if (allRaw['dryRun'] === true) {
      if (jsonFormat) {
        process.stdout.write(JSON.stringify({ success: true }) + '\n')
      } else {
        process.stdout.write('dry run: inputs valid, no action performed\n')
      }
      return
    }
    const handlerResult = await config.handler(parsed)

    const { renderText, formatHandlerError } = await getOutput()
    assert(handlerResult !== undefined, `command ${JSON.stringify(config.name)}: handler must return a JsonValue`)
    if (isErrorResult(handlerResult)) {
      if (jsonFormat === true) {
        process.stderr.write(JSON.stringify(handlerResult) + '\n')
      } else {
        process.stderr.write(`Error: ${formatHandlerError(handlerResult)}\n`)
      }
      process.exitCode = 1
    } else {
      const fieldsRaw = allRaw.outputFields as string | undefined
      const templateRaw = allRaw.outputTemplate as string | undefined
      let output = handlerResult
      if (fieldsRaw != null) {
        output = pickFields(output, parseFieldList(fieldsRaw))
      }
      if (templateRaw != null) {
        try {
          process.stdout.write(applyTemplate(output, templateRaw))
        } catch (err) {
          if (err instanceof TemplateAgainstPrimitiveError) {
            if (jsonFormat === true) {
              process.stderr.write(JSON.stringify({
                error: { code: 'output_template_error', message: err.message },
              }) + '\n')
            } else {
              process.stderr.write(`Error: ${err.message}\n`)
            }
            process.exitCode = 1
          } else {
            throw err
          }
        }
      } else if (jsonFormat === true) {
        process.stdout.write(JSON.stringify(output) + '\n')
      } else if (config.formatOutput !== undefined) {
        process.stdout.write(config.formatOutput(output, parsed))
      } else {
        process.stdout.write(renderText(output))
      }
    }
  })

  return cmd
}
