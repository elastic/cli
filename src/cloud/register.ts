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
 * E.g. `elasticsearch-projects` → `es`, used to build
 * `elastic cloud serverless es projects <action>`.
 */
const PROJECT_NAMESPACES: Record<string, string> = {
  'elasticsearch-projects': 'es',
  'observability-projects': 'observability',
  'security-projects': 'security',
}

/**
 * Cross-cutting namespaces promoted to direct children of `cloud` because their APIs
 * apply to both Hosted deployments and Serverless projects.
 */
const PROMOTED_NAMESPACES = new Set<string>([
  'accounts',
  'authentication',
  'organizations',
  'user-role-assignments',
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

function buildFlatNamespaceGroups (
  defsByNamespace: Map<string, CloudApiDefinition[]>,
  descriptionPrefix: string,
): OpaqueCommandHandle[] {
  const handles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of defsByNamespace) {
    checkDuplicates(defs, namespace)
    const leaves = defs.map(buildFlatLeaf)
    handles.push(
      defineGroup({ name: namespace, description: `${descriptionPrefix} ${namespace} commands` }, ...leaves),
    )
  }
  return handles
}

function buildServerlessProjectGroup (
  namespace: string,
  defs: CloudApiDefinition[],
): OpaqueCommandHandle {
  const typeShort = PROJECT_NAMESPACES[namespace]!
  const typeLabel = namespace.replace(/-projects$/, '')

  const leaves = defs.map((def) => {
    const shortName = simplifyProjectCommandName(def.name, namespace)
    const schema = buildCommandSchema(def)
    const cmd = defineCommand({
      name: shortName,
      description: def.description,
      input: schema,
      handler: createCloudHandler(def),
    })
    if (isCreateProjectCommand(def.name)) {
      (cmd as Command).option('--wait', 'Wait for the project to reach "initialized" phase before returning')
    }
    return cmd
  })

  const projectsGroup = defineGroup(
    { name: 'projects', description: `Manage ${typeLabel} projects` },
    ...leaves,
  )
  return defineGroup(
    { name: typeShort, description: `Elastic Serverless ${typeLabel} commands` },
    projectsGroup,
  )
}

function buildHostedGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const byNamespace = groupByNamespace(defs)
  const namespaceHandles = buildFlatNamespaceGroups(byNamespace, 'Cloud hosted')
  return defineGroup(
    { name: 'hosted', description: 'Manage Elastic Cloud Hosted deployments' },
    ...namespaceHandles,
  )
}

function buildServerlessGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const projectDefs = new Map<string, CloudApiDefinition[]>()
  const otherDefs = new Map<string, CloudApiDefinition[]>()

  for (const def of defs) {
    const target = PROJECT_NAMESPACES[def.namespace] != null ? projectDefs : otherDefs
    let group = target.get(def.namespace)
    if (group == null) {
      group = []
      target.set(def.namespace, group)
    }
    group.push(def)
  }

  const children: OpaqueCommandHandle[] = []
  for (const [namespace, nsDefs] of projectDefs) {
    children.push(buildServerlessProjectGroup(namespace, nsDefs))
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
export function registerCloudCommands(
  definitions: CloudApiDefinition[] = [...allCloudApis, ...allServerlessApis],
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const { promoted, hosted, serverless } = partitionDefinitions(definitions)

  const promotedGroups = buildFlatNamespaceGroups(promoted, 'Cloud')
  const hostedGroup = buildHostedGroup(hosted)
  const serverlessGroup = buildServerlessGroup(serverless)

  return defineGroup(
    { name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' },
    ...promotedGroups,
    hostedGroup,
    serverlessGroup,
  )
}
