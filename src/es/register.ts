/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { EsApiDefinition } from './types.ts'
import { validateApiDefinition } from './types.ts'
import { extractSchemaArgs } from '../lib/schema-args.ts'
import { allApis } from './apis/index.ts'
import { createEsHandler } from './handler.ts'

/**
 * Registers all Elasticsearch API commands under a top-level `es` group.
 *
 * For each definition:
 * 1. `def.input` is passed directly to `defineCommand` as the `input` schema, so the
 *    factory registers each param as a `--flag`, handles `--file`/stdin merging, and
 *    delivers the validated params to the handler as `parsed.input`.
 * 2. `extractSchemaArgs(def.input)` is called once at registration time; the resulting
 *    `SchemaArgDefinition[]` is closed over by the handler and passed to `buildRequestParams`
 *    on every invocation to drive `found_in`-based routing.
 *
 * @param definitions - flat array of API definitions; defaults to the full built-in registry
 * @returns an `OpaqueCommandHandle` for the top-level `es` group, ready for `program.addCommand()`
 * @throws {Error} if any definition fails validation or a namespace contains duplicate command names
 */
export function registerEsCommands(
  definitions: EsApiDefinition[] = allApis,
): OpaqueCommandHandle {
  // validate all definitions up-front for fail-fast detection of bad configs
  for (const def of definitions) {
    validateApiDefinition(def)
  }

  // group definitions by namespace, preserving insertion order
  const byNamespace = new Map<string, EsApiDefinition[]>()
  for (const def of definitions) {
    let group = byNamespace.get(def.namespace)
    if (group == null) {
      group = []
      byNamespace.set(def.namespace, group)
    }
    group.push(def)
  }

  // build one Commander group per namespace
  const namespaceHandles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of byNamespace) {
    // detect duplicate command names within the namespace
    const seen = new Set<string>()
    for (const def of defs) {
      if (seen.has(def.name)) {
        throw new Error(
          `duplicate command name "${def.name}" in namespace "${namespace}"`
        )
      }
      seen.add(def.name)
    }

    const leafHandles = defs.map((def) => {
      // use def.input directly if present, otherwise an empty loose schema
      const schema = def.input ?? z.looseObject({})
      // extract once at registration time; closed over by handler for routing
      const schemaArgs = extractSchemaArgs(schema)
      return defineCommand({
        name: def.name,
        description: def.description,
        input: schema,
        handler: createEsHandler(def, schemaArgs),
      })
    })

    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles)
}
