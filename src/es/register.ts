/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { EsApiDefinition, EsPathParam, EsQueryParam } from './types.ts'
import { validateApiDefinition } from './types.ts'
import { allApis } from './apis/index.ts'
import { createEsHandler } from './handler.ts'

/**
 * Builds the unified flat Zod schema for an ES API command.
 *
 * Path params, query params, and body fields are all combined into a single `z.object`
 * so the factory can register them as CLI flags, merge --file/stdin input, validate,
 * and deliver the whole thing to the handler as `parsed.input`.
 *
 * Schema key precedence:
 * - path params: `name`
 * - query params: `cliFlag ?? name`
 * - body fields: the Zod object shape keys, except underscore-prefixed fields (e.g. `_meta`)
 *   which cannot be valid CLI flag names and are instead allowed through passthrough from --file/stdin
 *
 * The resulting schema uses `z.looseObject` so that underscore-prefixed fields and other
 * unlisted body keys supplied via --file/stdin are not rejected by strict validation.
 *
 * `buildRequestParams` uses the definition's param arrays as a routing manifest to
 * classify each key in `parsed.input` back to path, querystring, or body.
 */
function buildCommandSchema(def: EsApiDefinition) {
  const shape: Record<string, z.ZodType> = {}

  for (const p of def.pathParams ?? []) {
    shape[p.name] = pathParamToZod(p)
  }

  for (const q of def.queryParams ?? []) {
    shape[q.cliFlag ?? q.name] = queryParamToZod(q)
  }

  if (def.body != null) {
    for (const [fieldName, fieldSchema] of Object.entries(def.body.shape as Record<string, z.ZodType>)) {
      // skip underscore-prefixed fields (e.g. _meta): toKebabCase produces a leading hyphen
      // which Commander rejects as a flag name. these fields can be supplied via --file/stdin
      // and will pass through due to the looseObject schema below.
      if (!fieldName.startsWith('_')) {
        shape[fieldName] = fieldSchema
      }
    }
  }

  // looseObject (passthrough) allows underscore-prefixed body fields and other unlisted keys
  // to flow through from --file/stdin without being rejected by strict schema validation
  return z.looseObject(shape)
}

/** converts an `EsPathParam` to its Zod field */
function pathParamToZod(p: EsPathParam): z.ZodType {
  const base = z.string().describe(p.description)
  return p.required ? base : base.optional()
}

/** converts an `EsQueryParam` to its Zod field */
function queryParamToZod(q: EsQueryParam): z.ZodType {
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
 * Registers all Elasticsearch API commands under a top-level `es` group.
 *
 * For each definition:
 * 1. A unified flat Zod schema is built from its `pathParams` + `queryParams` + optional `body`.
 * 2. `defineCommand` is called with that schema as `input`, so the factory registers each param
 *    as a `--flag`, handles `--file`/stdin merging, and delivers the validated params to the
 *    handler as `parsed.input`.
 * 3. `buildRequestParams` uses the definition's param arrays to route keys back to path,
 *    querystring, and body when constructing the transport request.
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
      const schema = buildCommandSchema(def)
      return defineCommand({
        name: def.name,
        description: def.description,
        input: schema,
        handler: createEsHandler(def),
      })
    })

    namespaceHandles.push(
      defineGroup({ name: namespace, description: `Elasticsearch ${namespace} API commands` }, ...leafHandles)
    )
  }

  return defineGroup({ name: 'es', description: 'Interact with the Elasticsearch API' }, ...namespaceHandles)
}
