/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { Command } from 'commander'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { CloudApiDefinition, CloudPathParam, CloudQueryParam } from './types.ts'
import { validateCloudApiDefinition } from './types.ts'
import { allCloudApis } from './apis.ts'
import { allServerlessApis } from './serverless-apis.ts'

import { createCloudHandler, isCreateProjectCommand } from './handler.ts'
import {
  applyCredentialPolicy,
  isCredentialCommand,
  readCredentialPolicyOptions,
} from './credentials.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Builds the unified flat Zod schema for a Cloud API command.
 *
 * Path params, query params, and body fields are combined into a single `z.object`
 * so the factory registers them as CLI flags, merges --file/stdin input, validates,
 * and delivers the whole thing to the handler as `parsed.input`.
 */
function buildCommandSchema(def: CloudApiDefinition) {
  const shape: Record<string, z.ZodType> = {}

  for (const p of def.pathParams ?? []) {
    shape[p.name] = pathParamToZod(p)
  }

  for (const q of def.queryParams ?? []) {
    shape[q.cliFlag ?? q.name] = queryParamToZod(q)
  }

  if (def.body != null) {
    for (const [fieldName, fieldSchema] of Object.entries(def.body.shape as Record<string, z.ZodType>)) {
      if (!fieldName.startsWith('_')) {
        shape[fieldName] = fieldSchema
      }
    }
  }

  return z.looseObject(shape)
}

function pathParamToZod(p: CloudPathParam): z.ZodType {
  const base = z.string().describe(p.description)
  return p.required ? base : base.optional()
}

function queryParamToZod(q: CloudQueryParam): z.ZodType {
  const base =
    q.type === 'boolean' ? z.boolean().describe(q.description) :
    q.type === 'number'  ? z.number().describe(q.description) :
                           z.string().describe(q.description)
  if (q.defaultValue !== undefined) {
    if (q.type === 'boolean') return (base as z.ZodBoolean).default(q.defaultValue as boolean)
    if (q.type === 'number')  return (base as z.ZodNumber).default(q.defaultValue as number)
    return (base as z.ZodString).default(q.defaultValue as string)
  }
  return q.required === true ? base : base.optional()
}

/**
 * Maps project-type namespaces from codegen to short CLI group names.
 * E.g. `elasticsearch-projects` → `search`, used to build
 * `elastic cloud serverless projects search <action>`.
 * The elasticsearch type also gets an `elasticsearch` alias.
 */
const PROJECT_NAMESPACES: Record<string, string> = {
  'elasticsearch-projects': 'search',
  'observability-projects': 'observability',
  'security-projects': 'security',
}

/**
 * Cross-cutting namespaces promoted to direct children of `cloud` because their APIs
 * apply to both Hosted deployments and Serverless projects.
 * Values are the display names shown in the CLI tree.
 */
// PROMOTED_NAMESPACES is defined in ./constants.ts to allow the lazy register
// to import it without pulling in allCloudApis / Zod schemas.
import { PROMOTED_NAMESPACES } from './constants.ts'

/**
 * Serverless namespaces whose commands are merged into a single `cross-project`
 * group rather than exposed as two separate namespaces.
 */
const CROSS_PROJECT_NAMESPACES = new Set<string>([
  'linked-projects',
  'linked-candidate-projects',
])

/**
 * Display name overrides for hosted namespaces.
 */
const HOSTED_NAMESPACE_RENAMES = new Map<string, string>([
  ['deployments-traffic-filter', 'traffic-filters'],
])

/**
 * Namespaces that belong under `cloud serverless`. Enumerated rather than derived
 * from `allServerlessApis` so callers passing synthetic definitions to
 * `registerCloudCommands` still partition deterministically.
 */
const SERVERLESS_NAMESPACES = new Set<string>([
  'elasticsearch-projects',
  'observability-projects',
  'security-projects',
  'regions',
  'traffic-filters',
  'linked-projects',
  'linked-candidate-projects',
])

/**
 * Strips the project-type identifier from a codegen command name to produce
 * a short action name for the restructured tree.
 *
 * E.g. `list-elasticsearch-projects` → `list`,
 *      `reset-elasticsearch-project-credentials` → `reset-credentials`,
 *      `get-elasticsearch-project-status` → `get-status`.
 */
export function simplifyProjectCommandName (name: string, namespace: string): string {
  const singular = namespace.endsWith('s') ? namespace.slice(0, -1) : namespace
  let simplified = name.replace(`-${namespace}`, '')
  if (simplified === name) {
    simplified = name.replace(`-${singular}`, '')
  }
  return simplified || name
}

function groupByNamespace (definitions: CloudApiDefinition[]): Map<string, CloudApiDefinition[]> {
  const byNamespace = new Map<string, CloudApiDefinition[]>()
  for (const def of definitions) {
    let group = byNamespace.get(def.namespace)
    if (group == null) {
      group = []
      byNamespace.set(def.namespace, group)
    }
    group.push(def)
  }
  return byNamespace
}

function checkDuplicates (defs: CloudApiDefinition[], namespace: string): void {
  const seen = new Set<string>()
  for (const def of defs) {
    if (seen.has(def.name)) {
      throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
    }
    seen.add(def.name)
  }
}

function buildFlatLeaf (def: CloudApiDefinition): OpaqueCommandHandle {
  const schema = buildCommandSchema(def)
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    handler: createCloudHandler(def),
  })
}

/**
 * Builds flat namespace group handles.
 * `renames` maps internal namespace keys to the display names used in the CLI tree;
 * if a namespace is not in the map its key is used as-is.
 */
function buildFlatNamespaceGroups (
  defsByNamespace: Map<string, CloudApiDefinition[]>,
  descriptionPrefix: string,
  renames: ReadonlyMap<string, string> = new Map(),
): OpaqueCommandHandle[] {
  const handles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of defsByNamespace) {
    const displayName = renames.get(namespace) ?? namespace
    checkDuplicates(defs, displayName)
    const leaves = defs.map(buildFlatLeaf)
    handles.push(
      defineGroup({ name: displayName, description: `${descriptionPrefix} ${displayName} commands` }, ...leaves),
    )
  }
  return handles
}

/**
 * Builds a single project-type subgroup for use inside `cloud serverless projects`.
 * E.g. `elasticsearch-projects` → `search|elasticsearch` group with shortened action names.
 */
function buildServerlessTypeGroup (
  namespace: string,
  defs: CloudApiDefinition[],
): OpaqueCommandHandle {
  const typeShort = PROJECT_NAMESPACES[namespace]!
  const typeLabel = namespace.replace(/-projects$/, '')

  const leaves = defs.map((def) => {
    const shortName = simplifyProjectCommandName(def.name, namespace)
    const schema = buildCommandSchema(def)
    const baseHandler = createCloudHandler(def)
    const handler: (parsed: ParsedResult) => Promise<JsonValue> = isCredentialCommand(def.name)
      ? async (parsed) => wrapWithCredentialPolicy(def.name, baseHandler, parsed)
      : baseHandler
    const cmd = defineCommand({
      name: shortName,
      description: def.description,
      input: schema,
      handler,
    })
    if (isCreateProjectCommand(def.name)) {
      (cmd as Command).option('--wait', 'Wait for the project to reach "initialized" phase before returning')
    }
    if (isCredentialCommand(def.name)) {
      (cmd as Command)
        .option('--save-as <name>', 'store returned credentials in the OS keychain and upsert a context of this name')
        .option('--credentials-file <path>', 'write credentials to a standalone YAML config fragment at this path (0600)')
        .option('--config-file <path>', 'override the config file written by --save-as (defaults to ~/.elasticrc.yml)')
        .option('--force', 'overwrite an existing context (--save-as) or file (--credentials-file)')
    }
    return cmd
  })

  const group = defineGroup(
    { name: typeShort, description: `Manage ${typeLabel} projects` },
    ...leaves,
  )
  // elasticsearch gets an explicit alias so both `search` and `elasticsearch` resolve
  if (typeShort === 'search') {
    ;(group as Command).alias('elasticsearch')
  }
  return group
}

function buildHostedGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const byNamespace = groupByNamespace(defs)
  const namespaceHandles = buildFlatNamespaceGroups(byNamespace, 'Cloud hosted', HOSTED_NAMESPACE_RENAMES)
  return defineGroup(
    { name: 'hosted', description: 'Manage Elastic Cloud Hosted deployments' },
    ...namespaceHandles,
  )
}

function buildServerlessGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const projectDefs = new Map<string, CloudApiDefinition[]>()
  const crossProjectDefs: CloudApiDefinition[] = []
  const otherDefs = new Map<string, CloudApiDefinition[]>()

  for (const def of defs) {
    if (PROJECT_NAMESPACES[def.namespace] != null) {
      let group = projectDefs.get(def.namespace)
      if (group == null) { group = []; projectDefs.set(def.namespace, group) }
      group.push(def)
    } else if (CROSS_PROJECT_NAMESPACES.has(def.namespace)) {
      crossProjectDefs.push(def)
    } else {
      let group = otherDefs.get(def.namespace)
      if (group == null) { group = []; otherDefs.set(def.namespace, group) }
      group.push(def)
    }
  }

  const children: OpaqueCommandHandle[] = []

  // Inverted axis: cloud serverless projects <type> <action>
  if (projectDefs.size > 0) {
    const typeGroups: OpaqueCommandHandle[] = []
    for (const [namespace, nsDefs] of projectDefs) {
      typeGroups.push(buildServerlessTypeGroup(namespace, nsDefs))
    }
    children.push(defineGroup(
      { name: 'projects', description: 'Manage Serverless projects' },
      ...typeGroups,
    ))
  }

  // Merge linked-projects + linked-candidate-projects into cross-project
  if (crossProjectDefs.length > 0) {
    checkDuplicates(crossProjectDefs, 'cross-project')
    children.push(defineGroup(
      { name: 'cross-project', description: 'Serverless cross-project commands' },
      ...crossProjectDefs.map(buildFlatLeaf),
    ))
  }

  children.push(...buildFlatNamespaceGroups(otherDefs, 'Serverless'))

  return defineGroup(
    { name: 'serverless', description: 'Manage Elastic Serverless projects and resources' },
    ...children,
  )
}

interface PartitionedDefinitions {
  promoted: Map<string, CloudApiDefinition[]>
  hosted: CloudApiDefinition[]
  serverless: CloudApiDefinition[]
}

function partitionDefinitions (definitions: CloudApiDefinition[]): PartitionedDefinitions {
  const promoted = new Map<string, CloudApiDefinition[]>()
  const hosted: CloudApiDefinition[] = []
  const serverless: CloudApiDefinition[] = []

  for (const def of definitions) {
    if (PROMOTED_NAMESPACES.has(def.namespace)) {
      let group = promoted.get(def.namespace)
      if (group == null) {
        group = []
        promoted.set(def.namespace, group)
      }
      group.push(def)
    } else if (SERVERLESS_NAMESPACES.has(def.namespace)) {
      serverless.push(def)
    } else {
      hosted.push(def)
    }
  }

  return { promoted, hosted, serverless }
}

/**
 * Registers the unified Cloud command tree under a top-level `cloud` group.
 *
 * The tree has three kinds of children:
 * - **Promoted cross-cutting namespaces** (`account`, `authentication`, `organizations`,
 *   `user-role-assignments`) as direct children of `cloud`, since their APIs apply to
 *   both Hosted and Serverless.
 * - **`cloud hosted <namespace> <command>`** for Hosted-specific APIs (deployments,
 *   deployment-templates, extensions, stack versions, etc.).
 * - **`cloud serverless <...>`** for Serverless APIs. Project namespaces are
 *   restructured into `serverless <type> projects <action>` (e.g.
 *   `serverless es projects list`); other namespaces (regions, traffic-filters, …)
 *   remain as flat groups with their codegen command names.
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in
 *   registry (hosted + serverless APIs combined).
 * @returns an `OpaqueCommandHandle` for the top-level `cloud` group.
 */
/**
 * Runs the base cloud handler, then applies the credential-saving policy if
 * the user passed `--save-as` / `--credentials-file`. Passthrough otherwise.
 * Policy errors (name collisions, missing contexts) are converted to the
 * factory's structured error shape so the CLI exits non-zero cleanly.
 */
async function wrapWithCredentialPolicy (
  cmdName: string,
  baseHandler: (parsed: ParsedResult) => Promise<JsonValue>,
  parsed: ParsedResult,
): Promise<JsonValue> {
  const body = await baseHandler(parsed)
  // If the base handler itself returned an error envelope, don't touch it.
  if (body != null && typeof body === 'object' && !Array.isArray(body) && 'error' in body) {
    return body
  }
  const opts = readCredentialPolicyOptions(parsed.options)
  if (opts.saveAs == null && opts.credentialsFile == null) return body
  try {
    const result = await applyCredentialPolicy(cmdName, body, opts)
    if (result.log.warnings.length > 0) {
      for (const w of result.log.warnings) process.stderr.write(`Warning: ${w}\n`)
    }
    return result.body
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: { code: 'credential_policy_error', message } }
  }
}

export function registerCloudCommands(
  definitions: CloudApiDefinition[] = [...allCloudApis, ...allServerlessApis],
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const { promoted, hosted, serverless } = partitionDefinitions(definitions)

  const promotedGroups = buildFlatNamespaceGroups(promoted, 'Cloud', PROMOTED_NAMESPACES)
  const hostedGroup = buildHostedGroup(hosted)
  const serverlessGroup = buildServerlessGroup(serverless)

  return defineGroup(
    { name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' },
    ...promotedGroups,
    hostedGroup,
    serverlessGroup,
  )
}
