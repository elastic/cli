/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { z } from 'zod'
import { defineCommand } from './factory.ts'
import { stripTransportMeta } from './factory.ts'
import type { OpaqueCommandHandle, CommandConfig, JsonValue } from './factory.ts'
import type { SchemaArgDefinition } from './lib/schema-args.ts'
import { NAMESPACES } from './namespaces.ts'

// ---------------------------------------------------------------------------
// Argh schema types
// ---------------------------------------------------------------------------

interface ArghValidation {
  kind: string
  min?: string | null
  max?: string | null
  pattern?: string | null
  values?: (string | null)[] | null
}

interface ArghParameter {
  role: string
  name: string
  shortName: string | null
  type: string
  required: boolean
  summary: string | null
  defaultValue: string | null
  repeatable: boolean
  separator: string | null
  aliases: (string | null)[] | null
  enumValues: (string | null)[] | null
  elementType: string | null
  hidden: boolean
  validations: ArghValidation[] | null
}

interface ArghCommand {
  path: (string | null)[]
  name: string
  summary: string | null
  notes: string | null
  usage: string | null
  examples: (string | null)[]
  parameters: ArghParameter[]
  aliases: (string | null)[] | null
  hidden: boolean
}

interface ArghNamespace {
  segment: string
  summary: string | null
  notes: string | null
  options: ArghParameter[]
  defaultCommand: null
  commands: ArghCommand[]
  namespaces: ArghNamespace[]
}

interface ArghSchema {
  schemaVersion: string
  name: string
  version: string
  description: string | null
  reservedMetaCommands: (string | null)[]
  globalOptions: ArghParameter[]
  rootDefault: null
  commands: ArghCommand[]
  namespaces: ArghNamespace[]
}

// ---------------------------------------------------------------------------
// Commander introspection helpers
// ---------------------------------------------------------------------------

interface AttachedConfig {
  config: CommandConfig
  schemaArgs: SchemaArgDefinition[]
}

function getAttachedConfig (cmd: OpaqueCommandHandle): AttachedConfig | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cmd as unknown as any)._commandConfig as AttachedConfig | undefined
}

function isHidden (cmd: OpaqueCommandHandle): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cmd as unknown as any)._hidden === true
}

function commandAliases (cmd: OpaqueCommandHandle): (string | null)[] | null {
  const list = cmd.aliases() as string[]
  return list.length > 0 ? list : null
}

// ---------------------------------------------------------------------------
// JSON Schema extraction helpers
// ---------------------------------------------------------------------------

type JsonSchemaNode = Record<string, unknown>

function resolveRef (node: JsonSchemaNode, root: JsonSchemaNode): JsonSchemaNode {
  const ref = node['$ref']
  if (typeof ref !== 'string') return node
  const parts = ref.replace(/^#\//, '').split('/')
  let cur: unknown = root
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return node
    cur = (cur as JsonSchemaNode)[part]
  }
  return (cur != null && typeof cur === 'object') ? cur as JsonSchemaNode : node
}

function unwrapNullable (node: JsonSchemaNode, root: JsonSchemaNode): JsonSchemaNode {
  const anyOf = node['anyOf']
  if (!Array.isArray(anyOf)) return node
  const nonNull = anyOf.find((b: unknown) => {
    if (b == null || typeof b !== 'object') return false
    const branch = b as JsonSchemaNode
    return branch['type'] !== 'null' && branch['const'] !== null
  })
  return nonNull != null ? resolveRef(nonNull as JsonSchemaNode, root) : node
}

function resolveNode (node: JsonSchemaNode, root: JsonSchemaNode): JsonSchemaNode {
  return unwrapNullable(resolveRef(node, root), root)
}

function extractEnumValues (node: JsonSchemaNode, root: JsonSchemaNode): (string | null)[] | null {
  const resolved = resolveNode(node, root)
  const enumVals = resolved['enum']
  if (!Array.isArray(enumVals) || enumVals.length === 0) return null
  return enumVals.map((v) => (v == null ? null : String(v)))
}

function extractElementType (node: JsonSchemaNode, root: JsonSchemaNode): string | null {
  const resolved = resolveNode(node, root)
  const items = resolved['items']
  if (items == null || typeof items !== 'object') return null
  const resolvedItems = resolveNode(items as JsonSchemaNode, root)
  const t = resolvedItems['type']
  return typeof t === 'string' ? t : null
}

function extractValidations (node: JsonSchemaNode, root: JsonSchemaNode): ArghValidation[] | null {
  const resolved = resolveNode(node, root)
  const validations: ArghValidation[] = []

  // Enum values are surfaced via the dedicated `enumValues` field; skip AllowedValues here.

  const min = resolved['minimum']
  const max = resolved['maximum']
  if (min !== undefined || max !== undefined) {
    validations.push({
      kind: 'Range',
      min: min !== undefined ? String(min) : null,
      max: max !== undefined ? String(max) : null,
    })
  }

  const pattern = resolved['pattern']
  if (typeof pattern === 'string') {
    validations.push({ kind: 'Pattern', pattern })
  }

  return validations.length > 0 ? validations : null
}

// ---------------------------------------------------------------------------
// Parameter builders
// ---------------------------------------------------------------------------

/** Map SchemaArgDefinition.type to a language-agnostic type string. */
function schemaArgType (arg: SchemaArgDefinition): string {
  switch (arg.type) {
    case 'boolean': return 'boolean'
    case 'number': return 'number'
    case 'object': return 'object'
    case 'array': return 'array'
    case 'enum':
    case 'string':
    default: return 'string'
  }
}

function buildGlobalParams (rootCmd: Command): ArghParameter[] {
  return rootCmd.options.map((opt) => {
    const isFlag = !opt.required && !opt.optional
    return {
      role: 'Named',
      name: opt.long?.replace(/^--/, '') ?? '',
      shortName: opt.short?.replace(/^-/, '') ?? null,
      type: isFlag ? 'boolean' : 'string',
      required: opt.mandatory ?? false,
      summary: opt.description ?? null,
      defaultValue: null,
      repeatable: false,
      separator: null,
      aliases: null,
      enumValues: null,
      elementType: null,
      hidden: false,
      validations: null,
    }
  })
}

function buildCommandParams (cmd: OpaqueCommandHandle): ArghParameter[] {
  const attached = getAttachedConfig(cmd)
  const params: ArghParameter[] = []

  let jsonSchema: JsonSchemaNode | undefined
  let schemaRoot: JsonSchemaNode | undefined
  if (attached?.config.input instanceof z.ZodType) {
    const raw = stripTransportMeta(
      z.toJSONSchema(attached.config.input, { reused: 'ref' }) as JsonValue
    )
    jsonSchema = raw as unknown as JsonSchemaNode
    schemaRoot = jsonSchema
  }

  function propNode (schemaKey: string): JsonSchemaNode | null {
    if (jsonSchema == null) return null
    const props = jsonSchema['properties']
    if (props == null || typeof props !== 'object') return null
    const p = (props as JsonSchemaNode)[schemaKey]
    return (p != null && typeof p === 'object') ? p as JsonSchemaNode : null
  }

  if (attached != null) {
    // Positional arg
    if (attached.config.positionalArg != null) {
      const pa = attached.config.positionalArg
      params.push({
        role: 'Positional',
        name: pa.name,
        shortName: null,
        type: 'string',
        required: pa.required !== false,
        summary: pa.description ?? null,
        defaultValue: null,
        repeatable: false,
        separator: null,
        aliases: null,
        enumValues: null,
        elementType: null,
        hidden: false,
        validations: null,
      })
    }

    // Hand-declared options (OptionDefinition[])
    for (const opt of (attached.config.options ?? [])) {
      params.push({
        role: 'Named',
        name: opt.long,
        shortName: opt.short ?? null,
        type: opt.type === 'boolean' ? 'boolean' : opt.type === 'number' ? 'number' : 'string',
        required: opt.required ?? false,
        summary: opt.description ?? null,
        defaultValue: opt.defaultValue != null ? String(opt.defaultValue) : null,
        repeatable: false,
        separator: null,
        aliases: null,
        enumValues: null,
        elementType: null,
        hidden: false,
        validations: null,
      })
    }

    // Schema-derived options (from extractSchemaArgs)
    for (const arg of attached.schemaArgs) {
      const node = propNode(arg.schemaKey)
      const root = schemaRoot ?? {}
      params.push({
        role: 'Named',
        name: arg.cliFlag,
        shortName: null,
        type: schemaArgType(arg),
        required: arg.required,
        summary: arg.description ?? null,
        defaultValue: arg.defaultValue != null ? String(arg.defaultValue) : null,
        repeatable: arg.acceptsArrayForm === true,
        separator: arg.acceptsArrayForm === true && arg.foundIn === 'body' ? ',' : null,
        aliases: null,
        enumValues: node != null ? extractEnumValues(node, root) : null,
        elementType: arg.type === 'array' && node != null ? extractElementType(node, root) : null,
        hidden: false,
        validations: node != null ? extractValidations(node, root) : null,
      })
    }

    // Framework-injected options: --input-file and --dry-run (not in OptionDefinition[])
    const coveredLong = new Set([
      ...(attached.config.options ?? []).map((o) => `--${o.long}`),
      ...attached.schemaArgs.map((a) => `--${a.cliFlag}`),
    ])
    for (const opt of cmd.options) {
      const long = opt.long ?? ''
      if (coveredLong.has(long)) continue
      const name = long.replace(/^--/, '')
      if (!name) continue
      const isFlag = !opt.required && !opt.optional
      params.push({
        role: 'Named',
        name,
        shortName: opt.short?.replace(/^-/, '') ?? null,
        type: isFlag ? 'boolean' : 'string',
        required: opt.mandatory ?? false,
        summary: opt.description ?? null,
        defaultValue: null,
        repeatable: false,
        separator: null,
        aliases: null,
        enumValues: null,
        elementType: null,
        hidden: false,
        validations: null,
      })
    }
  } else {
    // Fallback: no attached config — introspect Commander directly
    for (const opt of cmd.options) {
      const name = (opt.long ?? '').replace(/^--/, '')
      if (!name) continue
      const isFlag = !opt.required && !opt.optional
      params.push({
        role: 'Named',
        name,
        shortName: opt.short?.replace(/^-/, '') ?? null,
        type: isFlag ? 'boolean' : 'string',
        required: opt.mandatory ?? false,
        summary: opt.description ?? null,
        defaultValue: null,
        repeatable: false,
        separator: null,
        aliases: null,
        enumValues: null,
        elementType: null,
        hidden: false,
        validations: null,
      })
    }
  }

  return params
}

// ---------------------------------------------------------------------------
// Tree walker
// ---------------------------------------------------------------------------

function buildLeafCommand (cmd: OpaqueCommandHandle, path: string[]): ArghCommand {
  return {
    path,
    name: cmd.name(),
    summary: cmd.description() || null,
    notes: null,
    usage: null,
    examples: [],
    parameters: buildCommandParams(cmd),
    aliases: commandAliases(cmd),
    hidden: false,
  }
}

function walkCommands (
  cmd: OpaqueCommandHandle,
  pathSoFar: string[],
  outCommands: ArghCommand[],
): ArghNamespace | null {
  if (isHidden(cmd)) return null

  const subs = cmd.commands as OpaqueCommandHandle[]
  const name = cmd.name()

  if (subs.length === 0) {
    outCommands.push(buildLeafCommand(cmd, pathSoFar))
    return null
  }

  const nsCommands: ArghCommand[] = []
  const nsNamespaces: ArghNamespace[] = []
  const childPath = [...pathSoFar, name]

  for (const sub of subs) {
    if (isHidden(sub)) continue
    const subSubs = sub.commands as OpaqueCommandHandle[]
    if (subSubs.length === 0) {
      nsCommands.push(buildLeafCommand(sub, childPath))
    } else {
      const nested = walkCommands(sub, childPath, outCommands)
      if (nested != null) nsNamespaces.push(nested)
    }
  }

  return {
    segment: name,
    summary: cmd.description() || null,
    notes: null,
    options: [],
    defaultCommand: null,
    commands: nsCommands,
    namespaces: nsNamespaces,
  }
}

// ---------------------------------------------------------------------------
// Schema builder
// ---------------------------------------------------------------------------

export function buildArghSchema (
  root: OpaqueCommandHandle,
  globalOptions: ArghParameter[],
  version: string,
): ArghSchema {
  const allCommands: ArghCommand[] = []
  const namespaces: ArghNamespace[] = []

  for (const sub of root.commands as OpaqueCommandHandle[]) {
    if (isHidden(sub)) continue
    const subSubs = sub.commands as OpaqueCommandHandle[]
    if (subSubs.length === 0) {
      allCommands.push(buildLeafCommand(sub, []))
    } else {
      const ns = walkCommands(sub, [], allCommands)
      if (ns != null) namespaces.push(ns)
    }
  }

  return {
    schemaVersion: '1',
    name: root.name() || 'elastic',
    version,
    description: root.description() || null,
    reservedMetaCommands: ['cli-schema'],
    globalOptions,
    rootDefault: null,
    commands: allCommands,
    namespaces,
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export async function registerCliSchemaCommand (
  version: string,
  rootProgram: Command,
): Promise<OpaqueCommandHandle> {
  return defineCommand({
    name: 'cli-schema',
    description: 'Emit the CLI structure as argh-schema JSON',
    handler: async () => {
      const schemaRoot = new Command(rootProgram.name())
      schemaRoot.description(rootProgram.description())

      schemaRoot.addCommand(defineCommand({
        name: 'version',
        description: 'Print the elastic CLI version',
        handler: () => ({ version }),
      }))

      const loaded = await Promise.all(NAMESPACES.map((ns) => ns.load({ eager: true })))
      for (const ns of loaded) schemaRoot.addCommand(ns)

      const globalOptions = buildGlobalParams(rootProgram)
      return buildArghSchema(schemaRoot, globalOptions, version) as unknown as JsonValue
    },
    formatOutput: (result) => JSON.stringify(result, null, 2) + '\n',
  })
}
