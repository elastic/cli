/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsApiDefinition } from '../../src/es/types.ts'
import { resolveInput } from '../../src/es/types.ts'
import { extractSchemaArgs } from '../../src/lib/schema-args.ts'
import type { SchemaArgDefinition } from '../../src/lib/schema-args.ts'

/**
 * Result of mapping a YAML dot-notation action to a CLI command.
 * Contains the CLI arguments needed to invoke the command.
 */
export interface MappedAction {
  /** CLI args: ['es', namespace?, name, ...flags] */
  cliArgs: string[]
  /** true if the action accepts a request body */
  hasBody: boolean
}

/**
 * Builds a lookup from YAML dot-notation action names to EsApiDefinitions.
 *
 * YAML uses `namespace.name` (e.g. "indices.create") or just `name` (e.g. "get").
 * Definitions with `namespace` are keyed as `namespace.name`.
 * Definitions without `namespace` are keyed as just `name`.
 */
export function buildActionMap (definitions: EsApiDefinition[]): Map<string, EsApiDefinition> {
  const map = new Map<string, EsApiDefinition>()
  for (const def of definitions) {
    const key = def.namespace != null ? `${def.namespace}.${def.name}` : def.name
    map.set(key, def)
  }
  return map
}

/**
 * Maps a YAML test action to CLI arguments.
 *
 * @param action - dot-notation action name (e.g. "indices.create", "get")
 * @param params - YAML action parameters (path + query params, excluding body)
 * @param actionMap - lookup map from buildActionMap
 * @returns MappedAction with CLI args, or null if the action isn't registered
 */
export function mapAction (
  action: string,
  params: Record<string, unknown>,
  actionMap: Map<string, EsApiDefinition>
): MappedAction | null {
  const def = actionMap.get(action)
  if (def == null) return null

  const args: string[] = ['es']
  if (def.namespace != null) args.push(def.namespace)
  args.push(def.name)

  const schemaArgs = def.input != null
    ? extractSchemaArgs(resolveInput(def.input))
    : []

  const bodyFields = new Set(
    schemaArgs.filter((a) => a.foundIn === 'body').map((a) => a.schemaKey)
  )

  const argsByKey = new Map<string, SchemaArgDefinition>()
  for (const arg of schemaArgs) {
    argsByKey.set(arg.schemaKey, arg)
  }

  for (const [key, value] of Object.entries(params)) {
    if (bodyFields.has(key)) continue
    if (key === 'ignore') continue

    const argDef = argsByKey.get(key)
    const flag = argDef != null ? argDef.cliFlag : key.replace(/_/g, '-')

    args.push(`--${flag}`, String(value))
  }

  const hasBody = schemaArgs.some((a) => a.foundIn === 'body')
  return { cliArgs: args, hasBody }
}
