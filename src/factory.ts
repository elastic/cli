/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { readFileSync, writeSync } from 'node:fs'
import assert from 'node:assert/strict'
import { getResolvedConfig } from './config/store.ts'
import { extractSchemaArgs, validateSchemaArgs } from './lib/json-schema-args.ts'
import type { SchemaArgDefinition } from './lib/json-schema-args.ts'
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

const _require = createRequire(import.meta.url)

let _outputMod: Promise<{ renderText: typeof _RT; formatHandlerError: typeof _FHE }> | null = null
function getOutput () {
  if (_outputMod == null) _outputMod = import('./output.js') as unknown as typeof _outputMod
  return _outputMod!
}

/**
 * Module-level stdin reader - swappable in tests via {@link _testSetStdinReader}.
 */
let stdinReader: () => string = () => readFileSync(0, 'utf-8')

/**
 * Test-only seam: replaces the stdin reader with `fn` and returns a restore callback.
 * @internal
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
 * "views:desc,timestamp:asc" → [{ views: "desc" }, { timestamp: "asc" }]
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

function stringAccumulator (cmd: Command, attrName: string): (value: string, previous: string | undefined) => string {
  return (value: string, previous: string | undefined): string => {
    if (cmd.getOptionValueSource(attrName) === 'cli') return `${previous},${value}`
    return value
  }
}

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

function validateOptions (options: import('./factory-core.ts').OptionDefinition[]): void {
  const seenLong = new Set<string>()
  const seenShort = new Set<string>()

  for (const opt of options) {
    if (opt.long.length < 2) {
      throw new Error(`invalid option long name ${JSON.stringify(opt.long)}: long names must be at least 2 characters`)
    }
    if (opt.short !== undefined && opt.short.length !== 1) {
      throw new Error(`invalid short alias ${JSON.stringify(opt.short)} for --${opt.long}: short aliases must be exactly one character`)
    }
    if (seenLong.has(opt.long)) throw new Error(`duplicate option long name: --${opt.long}`)
    seenLong.add(opt.long)
    if (opt.long === 'dry-run') throw new Error('option --dry-run is reserved')
    if (opt.short !== undefined) {
      if (seenShort.has(opt.short)) throw new Error(`duplicate option short alias: -${opt.short}`)
      seenShort.add(opt.short)
    }
  }
}

/**
 * Validates the `input` field at definition time.
 * `input` must be a plain object with a `properties` key (JSON Schema), or undefined.
 */
function validateInput (name: string, input: unknown): void {
  if (input === undefined) return
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`command ${JSON.stringify(name)}: input must be a JSON Schema object`)
  }
  const obj = input as Record<string, unknown>
  // Must look like a JSON Schema object: either type:'object' or a properties key.
  // This catches accidental plain objects like { index: 'my-index' } which would silently validate everything.
  if (obj['type'] !== 'object' && obj['properties'] == null) {
    throw new Error(`command ${JSON.stringify(name)}: input must be a JSON Schema object with type: 'object' or a properties key`)
  }
}

function isJsonSchemaInput (input: unknown): input is Record<string, unknown> {
  return input !== undefined && input !== null && typeof input === 'object' && !Array.isArray(input)
}

/**
 * Configures `--help --json` on a leaf command to emit the JSON Schema.
 * Uses synchronous writes to prevent truncation on large schemas.
 */
function configureHelpWithSchema (
  cmd: OpaqueCommandHandle,
  inputSchema: Record<string, unknown> | undefined,
): void {
  const origHelp = cmd.createHelp()
  cmd.configureHelp({
    formatHelp: (thisCmd, helper) => {
      if (hasGlobalJsonFlag(thisCmd)) {
        const jsonSchema = inputSchema != null
          ? stripTransportMeta(inputSchema as JsonValue)
          : undefined
        return jsonSchema != null ? JSON.stringify(jsonSchema) + '\n' : ''
      }
      return origHelp.formatHelp(thisCmd, helper)
    }
  })
  cmd.configureOutput({
    writeOut: (str) => {
      ;(process.stdout as NodeJS.WriteStream & { _handle?: { setBlocking?: (b: boolean) => void } })
        ._handle?.setBlocking?.(true)
      writeSync(1, str)
    },
  })
}

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
 * Coerces a string to a number, returning undefined if not a valid number.
 */
function coerceNumber (val: string): number | undefined {
  if (val.trim() === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

/**
 * Creates a leaf command from a declarative config and returns an opaque handle.
 *
 * When `config.input` is a JSON Schema object, the factory:
 * 1. Extracts CLI flags from `input.properties` via `extractSchemaArgs`
 * 2. Registers each property as a Commander option
 * 3. Validates input with AJV (lazy-loaded) before calling the handler
 */
export function defineCommand (config: CommandConfig): OpaqueCommandHandle {
  validateName(config.name, 'command')
  validateOptions(config.options ?? [])
  validateInput(config.name, config.input)
  if (isJsonSchemaInput(config.input) && config.options?.some((o) => o.long === 'input-file')) {
    throw new Error(`command ${JSON.stringify(config.name)}: option --input-file is reserved when input is enabled`)
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
    const flag = opt.short != null ? `-${opt.short}, --${opt.long}` : `--${opt.long}`
    const register = opt.required === true ? cmd.requiredOption.bind(cmd) : cmd.option.bind(cmd)

    if (opt.type === 'boolean') {
      register(flag, opt.description)
    } else if (opt.type === 'number') {
      const flagWithArg = `${flag} <number>`
      const attrName = camelCase(opt.long)
      const parseNum = (val: string): number => {
        const n = coerceNumber(val)
        if (n === undefined) cmd.error(`option --${opt.long}: expected a number, got: ${val}`)
        return n!
      }
      register(flagWithArg, opt.description, singleValueGuard(cmd, attrName, `--${opt.long}`, parseNum), opt.defaultValue as number | undefined)
    } else {
      const attrName = camelCase(opt.long)
      register(`${flag} <string>`, opt.description, stringAccumulator(cmd, attrName), opt.defaultValue !== undefined ? String(opt.defaultValue) : undefined)
    }
  }

  // schema-derived CLI options
  let schemaArgs: SchemaArgDefinition[] = []
  if (isJsonSchemaInput(config.input)) {
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
        cmd.option(`--${arg.cliFlag} [value]`, arg.description)
      } else if (arg.type === 'number') {
        const attrName = camelCase(arg.cliFlag)
        const parseNum = (val: string): number => {
          const n = coerceNumber(val)
          if (n === undefined) cmd.error(`option --${arg.cliFlag}: expected a number, got: ${val}`)
          return n!
        }
        cmd.option(`--${arg.cliFlag} <number>`, desc, singleValueGuard(cmd, attrName, `--${arg.cliFlag}`, parseNum))
      } else if (arg.type === 'object' || arg.type === 'array') {
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <json>`, desc, singleValueGuard<string>(cmd, attrName, `--${arg.cliFlag}`))
      } else if (arg.type === 'enum') {
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <value>`, desc, singleValueGuard<string>(cmd, attrName, `--${arg.cliFlag}`))
      } else {
        const attrName = camelCase(arg.cliFlag)
        cmd.option(`--${arg.cliFlag} <string>`, desc, stringAccumulator(cmd, attrName))
      }
    }

  }
  // Read-only (GET/HEAD) commands with an empty input schema (e.g. `es info`)
  // take no input at all, so --input-file and --dry-run would be no-ops; hide
  // them (#378). Write commands keep --input-file even with an empty schema
  // because loose schemas pass the whole file through as the request body.
  const inputIsEmptyObject = isJsonSchemaInput(config.input) &&
    Object.keys((config.input as { properties?: Record<string, unknown> }).properties ?? {}).length === 0
  const hideNoInputFlags = config.readOnly === true && inputIsEmptyObject
  if (isJsonSchemaInput(config.input) && !hideNoInputFlags) {
    cmd.option('--input-file <path>', 'path to a JSON file to use as command input')
  }

  const schemaClaimsDryRun = schemaArgs.some((a) => a.cliFlag === 'dry-run')
  if (!schemaClaimsDryRun && !hideNoInputFlags) {
    cmd.option('--dry-run', 'validate all inputs and exit without performing any action')
  }

  configureHelpWithSchema(cmd, isJsonSchemaInput(config.input) ? config.input : undefined)

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
    const sortParsedKeys = new Set<string>()

    if (isJsonSchemaInput(config.input)) {
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
        // EAGAIN / EBADF can occur in IDE terminals (Cursor, VS Code integrated
        // terminal) and some CI environments where stdin is set to non-blocking
        // mode but no data is piped. Treat these as "no stdin data" rather than
        // crashing with an unhandled exception.
        let raw: string
        try {
          raw = stdinReader()
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code
          if (code === 'EAGAIN' || code === 'EBADF') {
            raw = ''
          } else {
            throw err
          }
        }
        if (raw.trim().length > 0) {
          inputValue = parseJsonContent(raw, 'stdin', cmd)
        }
      }
      if (config.inputTransform != null && inputValue !== undefined) {
        inputValue = config.inputTransform(inputValue)
      }

      // collect CLI arg values and merge over JSON input
      const cliInput: Record<string, unknown> = {}
      for (const arg of schemaArgs) {
        const camelKey = camelCase(arg.cliFlag)
        const raw = allRaw[camelKey]
        if (raw === undefined) continue
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
            cliInput[arg.schemaKey] = raw
          }
        } else if (
          arg.parseStyle === 'sort-pairs' &&
          arg.foundIn === 'body' &&
          typeof raw === 'string'
        ) {
          cliInput[arg.schemaKey] = parseSortPairs(raw)
          sortParsedKeys.add(arg.schemaKey)
        } else if (
          arg.type === 'string' &&
          arg.acceptsArrayForm === true &&
          arg.foundIn === 'body' &&
          typeof raw === 'string' &&
          raw.includes(',')
        ) {
          cliInput[arg.schemaKey] = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        } else {
          cliInput[arg.schemaKey] = raw
        }
      }

      if (Object.keys(cliInput).length > 0) {
        inputValue = { ...(inputValue as Record<string, unknown> ?? {}), ...cliInput }
      }

      if (inputValue === undefined) inputValue = {}
    }

    const positionalValue = config.positionalArg != null
      ? (cmd.processedArgs[0] as string | undefined)
      : undefined

    const resolvedConfig = getResolvedConfig()

    if (resolvedConfig?.commands != null) {
      const parts = commandPath(cmd).split(' ')
      const dotPath = (parts.length > 1 ? parts.slice(1) : parts).join('.')
      if (!isCommandAllowed(dotPath, resolvedConfig.commands)) {
        if (jsonFormat === true) {
          process.stderr.write(JSON.stringify({
            error: { code: 'command_blocked', message: `command "${dotPath}" is not allowed by the current policy` },
          }) + '\n')
          throw Object.assign(new Error('command_blocked'), { exitCode: 1 })
        }
        return cmd.error(`command "${dotPath}" is not allowed by the current policy`)
      }
    }

    const parsed: ParsedResult = {
      options,
      ...(resolvedConfig != null ? { config: resolvedConfig } : {}),
      ...(positionalValue !== undefined ? { arg: positionalValue } : {})
    }

    if (inputValue !== undefined) {
      assert(isJsonSchemaInput(config.input), `command ${JSON.stringify(config.name)}: input must be a JSON Schema object`)

      const { validateWithJsonSchema, formatValidationErrors } = await import('./lib/ajv-validate.js')

      // Relax schema for sort-pairs and CLI-provided body JSON fields:
      // - sort-pairs: CLI value is parsed to [{field: dir}] which won't match string schema
      // - body object/array fields from CLI --flag <json>: full DSL may not match strict schema
      // Files/stdin input is validated strictly.
      let validationSchema: Record<string, unknown> = config.input
      const relaxFields = schemaArgs.filter(
        (a) =>
          sortParsedKeys.has(a.schemaKey) ||
          ((a.type === 'object' || a.type === 'array') && (a.foundIn === 'body' || a.foundIn === undefined) && a.schemaKey in rawBodyValues)
      )
      if (relaxFields.length > 0 && typeof config.input['properties'] === 'object') {
        const props = { ...(config.input['properties'] as Record<string, unknown>) }
        for (const f of relaxFields) {
          if (f.schemaKey in props) {
            // Accept any value for these relaxed fields
            props[f.schemaKey] = {}
          }
        }
        validationSchema = { ...config.input, properties: props }
      }

      const result = validateWithJsonSchema(validationSchema, inputValue)

      if (result.success) {
        parsed.input = result.data
        if (Object.keys(rawBodyValues).length > 0) {
          parsed.rawBodyValues = rawBodyValues
        }
      } else {
        if (jsonFormat === true) {
          const writeErr = cmd.configureOutput().writeErr ?? ((s: string) => process.stderr.write(s))
          writeErr(JSON.stringify({
            error: {
              code: 'input_validation_failed',
              message: `Input validation failed with ${result.errors.length} issue(s)`,
              // Emit path as array (like Zod) for API compatibility
              issues: result.errors.map(e => ({ path: e.path_array, message: e.message }))
            }
          }) + '\n')
          throw Object.assign(new Error('input_validation_failed'), { exitCode: 1 })
        }
        return cmd.error(`input validation failed:\n${formatValidationErrors(result.errors)}`)
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
