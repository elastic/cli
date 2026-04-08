/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { CloudApiDefinition, CloudPathParam, CloudQueryParam } from './types.ts'
import { validateCloudApiDefinition } from './types.ts'
import { allCloudApis } from './apis.ts'
import { allServerlessApis } from './serverless-apis.ts'
import { createCloudHandler } from './handler.ts'

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
 * Registers all Cloud control plane API commands under a top-level `cloud` group.
 *
 * For each definition:
 * 1. A unified flat Zod schema is built from `pathParams` + `queryParams` + optional `body`.
 * 2. `defineCommand` is called with that schema as `input`.
 * 3. Commands are grouped by namespace (e.g. `deployments`, `projects`).
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in registry
 * @returns an `OpaqueCommandHandle` for the top-level `cloud` group
 */
export function registerCloudCommands(
  definitions: CloudApiDefinition[] = [...allCloudApis, ...allServerlessApis],
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const byNamespace = new Map<string, CloudApiDefinition[]>()
  for (const def of definitions) {
    let group = byNamespace.get(def.namespace)
    if (group == null) {
      group = []
      byNamespace.set(def.namespace, group)
    }
    group.push(def)
  }

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) {
        throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      }
      seen.add(def.name)
    }

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

  return defineGroup({ name: 'cloud', description: 'Manage Elastic Cloud deployments and serverless projects' }, ...namespaceHandles)
}
