/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { KbApiDefinition, KbPathParam, KbQueryParam, KbBodyParam } from './types.ts'
import { validateKbApiDefinition } from './types.ts'
import { allKbApis } from './apis.ts'
import { createKbHandler } from './handler.ts'

/**
 * Builds the unified flat Zod schema for a Kibana API command.
 *
 * Path params, query params, and body params are combined into a single `z.object`
 * so the factory registers them as CLI flags, merges --file/stdin input, validates,
 * and delivers the whole thing to the handler as `parsed.input`.
 */
function buildCommandSchema (def: KbApiDefinition): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodType> = {}

  for (const p of def.pathParams ?? []) {
    shape[p.name] = pathParamToZod(p)
  }

  for (const q of def.queryParams ?? []) {
    shape[q.cliFlag ?? q.name] = queryParamToZod(q)
  }

  for (const b of def.bodyParams ?? []) {
    shape[b.cliFlag ?? b.name] = bodyParamToZod(b)
  }

  return z.looseObject(shape)
}

function pathParamToZod (p: KbPathParam): z.ZodType {
  const base = z.string().describe(p.description)
  return p.required ? base : base.optional()
}

function queryParamToZod (q: KbQueryParam): z.ZodType {
  const base =
    q.type === 'boolean' ? z.boolean().describe(q.description) :
    q.type === 'number' ? z.number().describe(q.description) :
      z.string().describe(q.description)
  return q.required === true ? base : base.optional()
}

function bodyParamToZod (b: KbBodyParam): z.ZodType {
  let base: z.ZodType
  switch (b.type) {
    case 'boolean': base = z.boolean().describe(b.description); break
    case 'number': base = z.number().describe(b.description); break
    case 'array': base = z.array(z.unknown()).describe(b.description); break
    case 'object': base = z.record(z.string(), z.unknown()).describe(b.description); break
    default: base = z.string().describe(b.description); break
  }
  return b.required === true ? base : base.optional()
}

/** Builds a leaf command handle from a definition. */
function buildLeafHandle (def: KbApiDefinition): OpaqueCommandHandle {
  const schema = buildCommandSchema(def)
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    handler: createKbHandler(def)
  })
}

/**
 * Registers all Kibana API commands under a `kb` group, intended to be
 * nested under the top-level `stack` group by the CLI entrypoint.
 *
 * Definitions with a `namespace` are grouped into a sub-group (`elastic stack kb <namespace> <name>`).
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in registry
 * @returns an `OpaqueCommandHandle` for the `kb` group, ready for `program.addCommand()`
 */
export function registerKbCommands (
  definitions: KbApiDefinition[] = allKbApis
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateKbApiDefinition(def)
  }

  const byNamespace = new Map<string, KbApiDefinition[]>()
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

    const leafHandles = defs.map((def) => buildLeafHandle(def))
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Kibana ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup(
    { name: 'kb', description: 'Interact with the Kibana API' },
    ...namespaceHandles
  )
}
