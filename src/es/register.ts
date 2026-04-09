/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { EsApiDefinition } from './types.ts'
import { validateApiDefinition, resolveInput } from './types.ts'
import type { SchemaArgDefinition } from '../lib/schema-args.ts'
import { allApis } from './apis.ts'
import { createEsHandler } from './handler.ts'

/** Builds a leaf command handle from a definition and its pre-computed schema args. */
function buildLeafHandle (
  def: EsApiDefinition,
  defSchemaArgs: Map<EsApiDefinition, SchemaArgDefinition[]>
): OpaqueCommandHandle {
  const schema = def.input != null ? resolveInput(def.input) : z.looseObject({})
  const schemaArgs = defSchemaArgs.get(def) ?? []
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    handler: createEsHandler(def, schemaArgs)
  })
}

/**
 * Registers all Elasticsearch API commands under a top-level `es` group.
 *
 * Definitions with a `namespace` are grouped into a sub-group (`elastic es <namespace> <name>`).
 * Definitions without a `namespace` are registered as direct leaves (`elastic es <name>`).
 *
 * For each definition:
 * 1. `def.input` is passed directly to `defineCommand` as the `input` schema, so the
 *    factory registers each param as a `--flag`, handles `--input-file`/stdin merging, and
 *    delivers the validated params to the handler as `parsed.input`.
 * 2. `extractSchemaArgs(def.input)` is called once at registration time; the resulting
 *    `SchemaArgDefinition[]` is closed over by the handler and passed to `buildRequestParams`
 *    on every invocation to drive `found_in`-based routing.
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in registry
 * @returns an `OpaqueCommandHandle` for the top-level `es` group, ready for `program.addCommand()`
 * @throws {Error} if any definition fails validation or there are duplicate names at any level
 */
export function registerEsCommands (
  definitions: EsApiDefinition[] = allApis
): OpaqueCommandHandle {
  // validate all definitions up-front for fail-fast detection of bad configs;
  // capture the returned SchemaArgDefinition[] to avoid re-running extractSchemaArgs later
  const defSchemaArgs = new Map<EsApiDefinition, SchemaArgDefinition[]>()
  for (const def of definitions) {
    defSchemaArgs.set(def, validateApiDefinition(def))
  }

  // separate definitions into namespaced groups and namespace-less root leaves
  const byNamespace = new Map<string, EsApiDefinition[]>()
  const rootDefs: EsApiDefinition[] = []
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

  // track all top-level names (namespace group names + root leaf names) for collision detection
  const topLevelNames = new Set<string>()

  // build one Commander group per namespace
  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    if (topLevelNames.has(namespace)) {
      throw new Error(`duplicate command name "${namespace}" at the top level of es`)
    }
    topLevelNames.add(namespace)

    // detect duplicate command names within the namespace
    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) {
        throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
      }
      seen.add(def.name)
    }

    const leafHandles = defs.map((def) => buildLeafHandle(def, defSchemaArgs))

    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    )
  }

  // build root leaf handles (no intermediate group)
  const rootHandles: OpaqueCommandHandle[] = []
  for (const def of rootDefs) {
    if (topLevelNames.has(def.name)) {
      throw new Error(`duplicate command name "${def.name}" at the top level of es`)
    }
    topLevelNames.add(def.name)
    rootHandles.push(buildLeafHandle(def, defSchemaArgs))
  }

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles, ...rootHandles)
}
