/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsApiDefinition } from '../../src/es/types.ts'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'
import type { SchemaArgDefinition } from '../../src/lib/json-schema-args.ts'

/**
 * Result of mapping a YAML dot-notation action to a CLI command.
 */
export interface MappedAction {
  /** CLI args: ['es', namespace?, name, ...flags] */
  cliArgs: string[]
  /** true if the action accepts a request body */
  hasBody: boolean
  /** schema args lookup by key */
  bodyArgsByKey: Map<string, SchemaArgDefinition>
  /** set of body field keys */
  bodyFields: Set<string>
}

export function buildActionMap (definitions: EsApiDefinition[]): Map<string, EsApiDefinition> {
  const map = new Map<string, EsApiDefinition>()
  for (const def of definitions) {
    const key = def.namespace != null ? `${def.namespace}.${def.name}` : def.name
    map.set(key, def)
  }
  return map
}

export function mapAction (
  action: string,
  params: Record<string, unknown>,
  actionMap: Map<string, EsApiDefinition>
): MappedAction | null {
  const normalizedAction = action.split('.').map((s) => s.replace(/_/g, '-')).join('.')
  const def = actionMap.get(action) ?? actionMap.get(normalizedAction)
  if (def == null) return null

  const args: string[] = ['stack', 'es']
  if (def.namespace != null) args.push(def.namespace)
  args.push(def.name)

  const schemaArgs = def.input != null ? extractSchemaArgs(def.input) : []

  const bodyFields = new Set(
    schemaArgs.filter((a) => a.foundIn === 'body').map((a) => a.schemaKey)
  )

  const argsByKey = new Map<string, SchemaArgDefinition>()
  for (const arg of schemaArgs) {
    argsByKey.set(arg.schemaKey, arg)
  }

  for (const [key, value] of Object.entries(params)) {
    if (key === 'ignore') continue
    const argDef = argsByKey.get(key)
    if (argDef == null) continue
    args.push(`--${argDef.cliFlag}`, String(value))
  }

  const hasBody = schemaArgs.some((a) => a.foundIn === 'body')
  return { cliArgs: args, hasBody, bodyArgsByKey: argsByKey, bodyFields }
}
