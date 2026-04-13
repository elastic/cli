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
 * `elastic serverless es projects <action>`.
 */
const PROJECT_NAMESPACES: Record<string, string> = {
  'elasticsearch-projects': 'es',
  'observability-projects': 'observability',
  'security-projects': 'security',
}

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

/**
 * Registers Cloud Hosted (non-serverless) API commands under a top-level `cloud` group.
 *
 * For each definition:
 * 1. A unified flat Zod schema is built from `pathParams` + `queryParams` + optional `body`.
 * 2. `defineCommand` is called with that schema as `input`.
 * 3. Commands are grouped by namespace (e.g. `deployments`, `accounts`).
 *
 * @param definitions - flat array of API definitions; defaults to the hosted cloud registry
 * @returns an `OpaqueCommandHandle` for the top-level `cloud` group
 */
export function registerCloudCommands(
  definitions: CloudApiDefinition[] = allCloudApis,
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const byNamespace = groupByNamespace(definitions)
  const namespaceHandles: OpaqueCommandHandle[] = []

  for (const [namespace, defs] of byNamespace) {
    checkDuplicates(defs, namespace)

    const leafHandles = defs.map((def) => {
      const schema = buildCommandSchema(def)
      return defineCommand({
        name: def.name,
        description: def.description,
        input: schema,
        handler: createCloudHandler(def),
      })
    })

    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Cloud ${namespace} commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'cloud', description: 'Manage Elastic Cloud deployments' }, ...namespaceHandles)
}

/**
 * Registers Serverless API commands under a top-level `serverless` group.
 *
 * Project namespaces (`elasticsearch-projects`, `observability-projects`,
 * `security-projects`) are restructured into a cleaner hierarchy:
 *
 *   elastic serverless es projects list
 *   elastic serverless observability projects create
 *   elastic serverless security projects get --id <id>
 *
 * Other serverless namespaces (regions, traffic-filters, etc.) are kept as
 * direct children of the `serverless` group with their original command names.
 *
 * @param definitions - flat array of API definitions; defaults to the serverless registry
 * @returns an `OpaqueCommandHandle` for the top-level `serverless` group
 */
export function registerServerlessCommands(
  definitions: CloudApiDefinition[] = allServerlessApis,
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const projectDefs = new Map<string, CloudApiDefinition[]>()
  const otherDefs = new Map<string, CloudApiDefinition[]>()

  for (const def of definitions) {
    const target = PROJECT_NAMESPACES[def.namespace] != null ? projectDefs : otherDefs
    let group = target.get(def.namespace)
    if (group == null) {
      group = []
      target.set(def.namespace, group)
    }
    group.push(def)
  }

  const topLevelHandles: OpaqueCommandHandle[] = []

  for (const [namespace, defs] of projectDefs) {
    const typeShort = PROJECT_NAMESPACES[namespace]!
    const typeLabel = namespace.replace(/-projects$/, '')

    const leafHandles = defs.map((def) => {
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
      ...leafHandles,
    )
    const typeGroup = defineGroup(
      { name: typeShort, description: `Elastic Serverless ${typeLabel} commands` },
      projectsGroup,
    )
    topLevelHandles.push(typeGroup)
  }

  for (const [namespace, defs] of otherDefs) {
    checkDuplicates(defs, namespace)

    const leafHandles = defs.map((def) => {
      const schema = buildCommandSchema(def)
      return defineCommand({
        name: def.name,
        description: def.description,
        input: schema,
        handler: createCloudHandler(def),
      })
    })

    topLevelHandles.push(
      defineGroup({ name: namespace, description: `Serverless ${namespace} commands` }, ...leafHandles)
    )
  }

  return defineGroup(
    { name: 'serverless', description: 'Manage Elastic Serverless projects and resources' },
    ...topLevelHandles,
  )
}
