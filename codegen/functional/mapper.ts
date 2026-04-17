/*
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
  /** schema args lookup by key, for resolving body field flags */
  bodyArgsByKey: Map<string, SchemaArgDefinition>
  /** set of body field keys */
  bodyFields: Set<string>
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
  // YAML tests use underscore notation (e.g. "clear_scroll", "cat.ml_data_frame_analytics")
  // but CLI definitions use kebab-case (e.g. "clear-scroll", "cat.ml-data-frame-analytics").
  // Normalize by converting underscores to hyphens within each dot-separated segment.
  const normalizedAction = action.split('.').map((s) => s.replace(/_/g, '-')).join('.')
  const def = actionMap.get(action) ?? actionMap.get(normalizedAction)
  if (def == null) return null

  const args: string[] = ['stack', 'es']
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
    if (key === 'ignore') continue

    const argDef = argsByKey.get(key)
    // Skip params the CLI doesn't expose as flags (e.g. cat's 'format')
    if (argDef == null) continue

    // Body fields from YAML params are passed as CLI flags (same as non-body params);
    // they will be handled alongside any explicit body in buildCommand.
    args.push(`--${argDef.cliFlag}`, String(value))
  }

  const hasBody = schemaArgs.some((a) => a.foundIn === 'body')
  return { cliArgs: args, hasBody, bodyArgsByKey: argsByKey, bodyFields }
}
