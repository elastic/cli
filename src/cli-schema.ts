/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { z } from 'zod'
import { defineCommand } from './factory.ts'
import { stripTransportMeta } from './factory.ts'
import type { OpaqueCommandHandle, CommandConfig, CommandIntent, JsonValue } from './factory.ts'
import type { SchemaArgDefinition } from './lib/schema-args.ts'
import type { NamespaceEntry } from './namespaces.ts'

// ---------------------------------------------------------------------------
// CLI schema types
// ---------------------------------------------------------------------------

interface CliValidation {
  kind: string
  min?: string
  max?: string
  pattern?: string
  values?: string[]
}

interface CliParameter {
  role: string
  name: string
  type: string
  required: boolean
  shortName?: string
  summary?: string
  defaultValue?: string
  repeatable?: boolean
  separator?: string
  aliases?: string[]
  enumValues?: string[]
  elementType?: string
  hidden?: boolean
  validations?: CliValidation[]
}

interface CliCommand {
  path: string[]
  name: string
  parameters: CliParameter[]
  summary?: string
  aliases?: string[]
  hidden?: boolean
  intent?: CommandIntent
}

interface CliNamespace {
  segment: string
  commands: CliCommand[]
  namespaces: CliNamespace[]
  summary?: string
  options?: CliParameter[]
}

interface CliEnvVar {
  name: string
  required: boolean
  description?: string
}

interface CliConfigFile {
  path: string
  required: boolean
  description?: string
}

interface CliEnvironment {
  variables: CliEnvVar[]
  configFiles: CliConfigFile[]
}

interface CliSchema {
  schemaVersion: number
  name: string
  version: string
  reservedMetaCommands: string[]
  globalOptions: CliParameter[]
  environment: CliEnvironment
  commands: CliCommand[]
  namespaces: CliNamespace[]
  description?: string
}

// ---------------------------------------------------------------------------
// Environment declaration (sources: src/config/loader.ts, src/lib/logo.ts,
//                                   src/lib/cloud-client.ts)
// ---------------------------------------------------------------------------

const ENVIRONMENT: CliEnvironment = {
  variables: [
    {
      name: 'ELASTIC_CLI_CONFIG_FILE',
      required: false,
      description: 'Override the config file path (precedence: --config-file > this > home directory discovery)',
    },
    {
      name: 'ELASTIC_NO_BANNER',
      required: false,
      description: 'Set to 1 to suppress the startup logo',
    },
    {
      name: 'ELASTIC_CLOUD_ADMIN_API',
      required: false,
      description: 'Override the Elastic Cloud admin API base URL',
    },
  ],
  configFiles: [
    { path: '~/.elasticrc.yml',  required: false, description: 'Primary config file (recommended)' },
    { path: '~/.elasticrc.yaml', required: false, description: 'Alternative YAML extension' },
    { path: '~/.elasticrc.json', required: false, description: 'JSON form of the config file' },
    { path: '~/.elasticrc',      required: false, description: 'Extensionless form of the config file' },
  ],
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

function commandAliases (cmd: OpaqueCommandHandle): string[] | undefined {
  const list = cmd.aliases() as string[]
  return list.length > 0 ? list : undefined
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

function extractEnumValues (node: JsonSchemaNode, root: JsonSchemaNode): string[] | undefined {
  const resolved = resolveNode(node, root)
  const enumVals = resolved['enum']
  if (!Array.isArray(enumVals) || enumVals.length === 0) return undefined
  return enumVals.filter((v) => v != null).map(String)
}

function extractElementType (node: JsonSchemaNode, root: JsonSchemaNode): string | undefined {
  const resolved = resolveNode(node, root)
  const items = resolved['items']
  if (items == null || typeof items !== 'object') return undefined
  const resolvedItems = resolveNode(items as JsonSchemaNode, root)
  const t = resolvedItems['type']
  if (typeof t !== 'string') return undefined
  // Spec only allows scalar element types; object/array items are not expressible
  return ['string', 'integer', 'number', 'boolean'].includes(t) ? t : undefined
}

function extractValidations (node: JsonSchemaNode, root: JsonSchemaNode): CliValidation[] | undefined {
  const resolved = resolveNode(node, root)
  const validations: CliValidation[] = []

  // Enum values are surfaced via the dedicated `enumValues` field; skip here.

  const min = resolved['minimum']
  const max = resolved['maximum']
  if (min !== undefined || max !== undefined) {
    validations.push({
      kind: 'range',
      ...(min !== undefined && { min: String(min) }),
      ...(max !== undefined && { max: String(max) }),
    })
  }

  const pattern = resolved['pattern']
  if (typeof pattern === 'string') {
    validations.push({ kind: 'regex', pattern })
  }

  return validations.length > 0 ? validations : undefined
}

// ---------------------------------------------------------------------------
// Parameter builders
// ---------------------------------------------------------------------------

/** Map SchemaArgDefinition.type to a spec-compliant type string. */
function schemaArgType (arg: SchemaArgDefinition, enumValues: string[] | undefined): string {
  if (enumValues != null && enumValues.length > 0) return 'enum'
  switch (arg.type) {
    case 'boolean':
    case 'number':
    case 'array':
      return arg.type
    case 'object':
    case 'enum':
    case 'string':
    default:
      return 'string'
  }
}

function buildGlobalParams (rootCmd: Command): CliParameter[] {
  return rootCmd.options.map((opt) => {
    const isFlag = !opt.required && !opt.optional
    const name = opt.long?.replace(/^--/, '') ?? ''
    return {
      role: name === 'dry-run' ? 'dryRun' : 'flag',
      name,
      type: isFlag ? 'boolean' : 'string',
      required: opt.mandatory ?? false,
      ...(opt.short != null && { shortName: opt.short.replace(/^-/, '') }),
      ...(opt.description && { summary: opt.description }),
    }
  })
}

function buildCommandParams (cmd: OpaqueCommandHandle): CliParameter[] {
  const attached = getAttachedConfig(cmd)
  const params: CliParameter[] = []

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
        role: 'positional',
        name: pa.name,
        type: 'string',
        required: pa.required !== false,
        ...(pa.description && { summary: pa.description }),
      })
    }

    // Hand-declared options (OptionDefinition[])
    for (const opt of (attached.config.options ?? [])) {
      params.push({
        role: 'flag',
        name: opt.long,
        type: opt.type === 'boolean' ? 'boolean' : opt.type === 'number' ? 'number' : 'string',
        required: opt.required ?? false,
        ...(opt.short != null && { shortName: opt.short }),
        ...(opt.description && { summary: opt.description }),
        ...(opt.defaultValue != null && { defaultValue: String(opt.defaultValue) }),
      })
    }

    // Schema-derived options (from extractSchemaArgs)
    for (const arg of attached.schemaArgs) {
      const node = propNode(arg.schemaKey)
      const root = schemaRoot ?? {}
      const enumValues = node != null ? extractEnumValues(node, root) : undefined
      params.push({
        role: 'flag',
        name: arg.cliFlag,
        type: schemaArgType(arg, enumValues),
        required: arg.required,
        ...(arg.description && { summary: arg.description }),
        ...(arg.defaultValue != null && { defaultValue: String(arg.defaultValue) }),
        ...(arg.acceptsArrayForm === true && { repeatable: true }),
        ...(arg.acceptsArrayForm === true && arg.foundIn === 'body' && { separator: ',' }),
        ...(enumValues != null && { enumValues }),
        ...(arg.type === 'array' && node != null && extractElementType(node, root) != null && { elementType: extractElementType(node, root) as string }),
        ...(node != null && extractValidations(node, root) != null && { validations: extractValidations(node, root) as CliValidation[] }),
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
        role: name === 'dry-run' ? 'dryRun' : 'flag',
        name,
        type: isFlag ? 'boolean' : 'string',
        required: opt.mandatory ?? false,
        ...(opt.short != null && { shortName: opt.short.replace(/^-/, '') }),
        ...(opt.description && { summary: opt.description }),
      })
    }
  } else {
    // Fallback: no attached config — introspect Commander directly
    for (const opt of cmd.options) {
      const name = (opt.long ?? '').replace(/^--/, '')
      if (!name) continue
      const isFlag = !opt.required && !opt.optional
      params.push({
        role: name === 'dry-run' ? 'dryRun' : 'flag',
        name,
        type: isFlag ? 'boolean' : 'string',
        required: opt.mandatory ?? false,
        ...(opt.short != null && { shortName: opt.short.replace(/^-/, '') }),
        ...(opt.description && { summary: opt.description }),
      })
    }
  }

  return params
}

// ---------------------------------------------------------------------------
// Intent helpers
// ---------------------------------------------------------------------------

/**
 * Merges a command's declared intent with the namespace-derived requiresAuth value.
 * An explicit requiresAuth on the command's intent takes precedence over the namespace default.
 */
function mergeIntent (commandIntent: CommandIntent | undefined, requiresAuth: boolean): CommandIntent {
  if (commandIntent?.requiresAuth !== undefined) {
    return commandIntent
  }
  return { ...(commandIntent ?? {}), requiresAuth }
}

// ---------------------------------------------------------------------------
// Tree walker
// ---------------------------------------------------------------------------

function buildLeafCommand (cmd: OpaqueCommandHandle, path: string[], requiresAuth: boolean): CliCommand {
  const attached = getAttachedConfig(cmd)
  const intent = mergeIntent(attached?.config.intent, requiresAuth)
  const aliases = commandAliases(cmd)
  return {
    path,
    name: cmd.name(),
    parameters: buildCommandParams(cmd),
    ...(cmd.description() && { summary: cmd.description() }),
    ...(aliases != null && { aliases }),
    intent,
  }
}

function walkCommands (
  cmd: OpaqueCommandHandle,
  pathSoFar: string[],
  outCommands: CliCommand[],
  requiresAuth: boolean,
): CliNamespace | null {
  if (isHidden(cmd)) return null

  const subs = cmd.commands as OpaqueCommandHandle[]
  const name = cmd.name()

  if (subs.length === 0) {
    outCommands.push(buildLeafCommand(cmd, pathSoFar, requiresAuth))
    return null
  }

  const nsCommands: CliCommand[] = []
  const nsNamespaces: CliNamespace[] = []
  const childPath = [...pathSoFar, name]

  for (const sub of subs) {
    if (isHidden(sub)) continue
    const subSubs = sub.commands as OpaqueCommandHandle[]
    if (subSubs.length === 0) {
      nsCommands.push(buildLeafCommand(sub, childPath, requiresAuth))
    } else {
      const nested = walkCommands(sub, childPath, outCommands, requiresAuth)
      if (nested != null) nsNamespaces.push(nested)
    }
  }

  return {
    segment: name,
    commands: nsCommands,
    namespaces: nsNamespaces,
    ...(cmd.description() && { summary: cmd.description() }),
  }
}

// ---------------------------------------------------------------------------
// Option hoisting
// ---------------------------------------------------------------------------

function collectAllLeaves (ns: CliNamespace): CliCommand[] {
  return [...ns.commands, ...ns.namespaces.flatMap(collectAllLeaves)]
}

/**
 * Hoists flags common to every leaf command in `ns` up to `ns.options`,
 * stripping them from individual command parameters.
 * Top-down: call on a namespace before recursing so children inherit the result.
 */
function hoistNamespaceOptions (ns: CliNamespace): void {
  const leaves = collectAllLeaves(ns)
  if (leaves.length === 0) return

  const firstLeaf = leaves[0]
  if (firstLeaf == null) return
  const candidates = firstLeaf.parameters.filter(p => p.role !== 'positional')
  const commonNames = new Set(
    candidates
      .map(p => p.name)
      .filter(name => leaves.every(cmd => cmd.parameters.some(p => p.name === name)))
  )
  if (commonNames.size === 0) return

  ns.options = candidates.filter(p => commonNames.has(p.name))

  function stripFrom (n: CliNamespace): void {
    for (const cmd of n.commands) {
      cmd.parameters = cmd.parameters.filter(p => !commonNames.has(p.name))
    }
    for (const sub of n.namespaces) stripFrom(sub)
  }
  stripFrom(ns)
}

/**
 * Promotes flags present in every namespace's options AND every root-level command
 * up to globalOptions, removing them from namespace options and root commands.
 */
function promoteToGlobalOptions (
  namespaces: CliNamespace[],
  rootCommands: CliCommand[],
): CliParameter[] {
  const firstNs = namespaces[0]
  if (firstNs == null || (firstNs.options ?? []).length === 0) return []

  const commonNames = new Set(
    (firstNs.options ?? [])
      .map(p => p.name)
      .filter(name =>
        namespaces.every(ns => (ns.options ?? []).some(p => p.name === name)) &&
        (rootCommands.length === 0 || rootCommands.every(cmd => cmd.parameters.some(p => p.name === name)))
      )
  )
  if (commonNames.size === 0) return []

  const promoted = (firstNs.options ?? []).filter(p => commonNames.has(p.name))

  for (const ns of namespaces) {
    const remaining = (ns.options ?? []).filter(p => !commonNames.has(p.name))
    if (remaining.length > 0) {
      ns.options = remaining
    } else {
      delete (ns as { options?: CliParameter[] }).options
    }
  }

  for (const cmd of rootCommands) {
    cmd.parameters = cmd.parameters.filter(p => !commonNames.has(p.name))
  }

  return promoted
}

// ---------------------------------------------------------------------------
// Schema builder
// ---------------------------------------------------------------------------

export function buildCliSchema (
  root: OpaqueCommandHandle,
  globalOptions: CliParameter[],
  version: string,
  noContextNames: ReadonlySet<string> = new Set(),
): CliSchema {
  const allCommands: CliCommand[] = []
  const namespaces: CliNamespace[] = []

  for (const sub of root.commands as OpaqueCommandHandle[]) {
    if (isHidden(sub)) continue
    const requiresAuth = !noContextNames.has(sub.name())
    const subSubs = sub.commands as OpaqueCommandHandle[]
    if (subSubs.length === 0) {
      allCommands.push(buildLeafCommand(sub, [], requiresAuth))
    } else {
      const ns = walkCommands(sub, [], allCommands, requiresAuth)
      if (ns != null) namespaces.push(ns)
    }
  }

  // Hoist common flags within each top-level namespace, then promote any that
  // are universal across all namespaces and root commands up to globalOptions.
  for (const ns of namespaces) {
    hoistNamespaceOptions(ns)
  }
  const promoted = promoteToGlobalOptions(namespaces, allCommands)

  return {
    schemaVersion: 1,
    name: root.name() || 'elastic',
    version,
    reservedMetaCommands: ['cli-schema'],
    globalOptions: [...globalOptions, ...promoted],
    environment: ENVIRONMENT,
    commands: allCommands,
    namespaces,
    ...(root.description() && { description: root.description() }),
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export async function registerCliSchemaCommand (
  version: string,
  rootProgram: Command | undefined,
  namespaces: NamespaceEntry[],
): Promise<OpaqueCommandHandle> {
  return defineCommand({
    name: 'cli-schema',
    description: 'Emit the CLI structure as JSON',
    handler: async () => {
      const schemaRoot = new Command(rootProgram?.name() ?? 'elastic')
      schemaRoot.description(rootProgram?.description() ?? '')

      schemaRoot.addCommand(defineCommand({
        name: 'version',
        description: 'Print the elastic CLI version',
        handler: () => ({ version }),
      }))

      const loaded = await Promise.all(namespaces.map((ns) => ns.load({ eager: true })))
      for (const ns of loaded) schemaRoot.addCommand(ns)

      const globalOptions = rootProgram != null ? buildGlobalParams(rootProgram) : []

      // Build the set of namespace names that don't require context/auth
      const noContextNames = new Set<string>([
        ...namespaces.filter(ns => ns.requiresContext === false).map(ns => ns.name),
        'version', // root-level version command needs no auth
      ])

      return buildCliSchema(schemaRoot, globalOptions, version, noContextNames) as unknown as JsonValue
    },
    formatOutput: (result) => JSON.stringify(result, null, 2) + '\n',
  })
}
