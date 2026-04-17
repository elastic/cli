/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { KbApiDefinition } from './types.ts'
import { validateKbApiDefinition, resolveInput } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import { allKbApis } from './apis.ts'
import { createKbHandler } from './handler.ts'

/** Builds a leaf command handle from a definition and its pre-computed schema args. */
function buildLeafHandle (
  def: KbApiDefinition,
  defSchemaArgs: Map<KbApiDefinition, SchemaArgDefinition[]>
): OpaqueCommandHandle {
  const schema = def.input != null ? resolveInput(def.input) : z.looseObject({})
  const schemaArgs = defSchemaArgs.get(def) ?? []
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    handler: createKbHandler(def, schemaArgs)
  })
}

/**
 * Registers all Kibana API commands under a top-level `kb` group.
 *
 * Definitions with a `namespace` are grouped into a sub-group (`elastic kb <namespace> <name>`).
 * Definitions without a `namespace` are registered as direct leaves (`elastic kb <name>`).
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in registry
 * @returns an `OpaqueCommandHandle` for the top-level `kb` group, ready for `program.addCommand()`
 * @throws {Error} if any definition fails validation or there are duplicate names at any level
 */
export function registerKbCommands (
  definitions: KbApiDefinition[] = allKbApis
): OpaqueCommandHandle {
  const defSchemaArgs = new Map<KbApiDefinition, SchemaArgDefinition[]>()
  for (const def of definitions) {
    defSchemaArgs.set(def, validateKbApiDefinition(def))
  }

  const byNamespace = new Map<string, KbApiDefinition[]>()
  const rootDefs: KbApiDefinition[] = []
  for (const def of definitions) {
    if (def.namespace !== undefined) {
      let group = byNamespace.get(def.namespace)
      if (group == null) {
        group = []
        byNamespace.set(def.namespace, group)
      }
      group.push(def)
    } else {
      rootDefs.push(def)
    }
  }

  const topLevelNames = new Set<string>()

  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    if (topLevelNames.has(namespace)) {
      throw new Error(`duplicate command name "${namespace}" at the top level of kb`)
    }
    topLevelNames.add(namespace)

    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) {
        throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      }
      seen.add(def.name)
    }

    const leafHandles = defs.map((def) => buildLeafHandle(def, defSchemaArgs))
    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Kibana ${namespace} API commands` }, ...leafHandles)
    )
  }

  const rootHandles: OpaqueCommandHandle[] = []
  for (const def of rootDefs) {
    if (topLevelNames.has(def.name)) {
      throw new Error(`duplicate command name "${def.name}" at the top level of kb`)
    }
    topLevelNames.add(def.name)
    rootHandles.push(buildLeafHandle(def, defSchemaArgs))
  }

  return defineGroup(
    { name: 'kb', description: 'Interact with the Kibana API' },
    ...namespaceHandles,
    ...rootHandles
  )
}
