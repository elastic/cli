/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApiActionDef } from './types.ts'
import { extractSchemaArgs } from '../../src/lib/json-schema-args.ts'
import type { SchemaArgDefinition } from '../../src/lib/json-schema-args.ts'
import { inferIntentFromHttp } from '@cli-schema/spec'

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
 * Builds a lookup from YAML dot-notation action names to API definitions.
 *
 * YAML uses `namespace.name` (e.g. "indices.create") or just `name` (e.g. "get").
 * Definitions with `namespace` are keyed as `namespace.name`.
 * Definitions without `namespace` are keyed as just `name`.
 */
export function buildActionMap (definitions: ApiActionDef[]): Map<string, ApiActionDef> {
  const map = new Map<string, ApiActionDef>()
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
  actionMap: Map<string, ApiActionDef>,
  clientArgs: string[] = ['stack', 'es']
): MappedAction | null {
  // YAML tests use underscore notation (e.g. "clear_scroll", "cat.ml_data_frame_analytics")
  // but CLI definitions use kebab-case (e.g. "clear-scroll", "cat.ml-data-frame-analytics").
  // Normalize by converting underscores to hyphens within each dot-separated segment.
  const normalizedAction = action.split('.').map((s) => s.replace(/_/g, '-')).join('.')
  const def = actionMap.get(action) ?? actionMap.get(normalizedAction)
  if (def == null) return null

  const args: string[] = [...clientArgs]
  if (def.namespace != null) args.push(def.namespace)
  args.push(def.name)

  // Destructive commands prompt for confirmation; test scripts run non-interactively.
  const intent = def.intent ?? inferIntentFromHttp(def.method)
  if (intent?.destructive === true || intent?.requiresConfirmation === true) {
    args.push('--yes')
  }

  const schemaArgs = def.input != null ? extractSchemaArgs(def.input) : []

  const bodyFields = new Set(
    schemaArgs.filter((a) => a.foundIn === 'body').map((a) => a.schemaKey)
  )

  const argsByKey = new Map<string, SchemaArgDefinition>()
  for (const arg of schemaArgs) {
    argsByKey.set(arg.schemaKey, arg)
  }

  // YAML definitions use snake_case param keys (e.g. agent_id) but upstream
  // schema keys are frequently camelCase (e.g. agentId). Fall back to a
  // separator/case-insensitive match so these params still map to a flag
  // instead of being silently dropped (which yields a missing required arg).
  const canonKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '')
  const canonMap = new Map<string, SchemaArgDefinition>()
  const canonAmbiguous = new Set<string>()
  for (const arg of schemaArgs) {
    const c = canonKey(arg.schemaKey)
    if (canonMap.has(c)) canonAmbiguous.add(c)
    else canonMap.set(c, arg)
  }

  for (const [key, value] of Object.entries(params)) {
    if (key === 'ignore') continue
    // Exact match first; fall back to canonical match only when unambiguous.
    let argDef = argsByKey.get(key)
    if (argDef == null) {
      const c = canonKey(key)
      if (!canonAmbiguous.has(c)) argDef = canonMap.get(c)
    }
    // Skip params the CLI doesn't expose as flags (e.g. cat's 'format')
    if (argDef == null) continue
    // Body fields from YAML params are passed as CLI flags (same as non-body params);
    // they will be handled alongside any explicit body in buildCommand.
    // Object/array param values must be JSON-encoded so the CLI can parse them;
    // String(value) would yield "[object Object]". shellEscape (in the generator)
    // handles quoting.
    const argValue = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
    args.push(`--${argDef.cliFlag}`, argValue)
  }

  const hasBody = schemaArgs.some((a) => a.foundIn === 'body')
  return { cliArgs: args, hasBody, bodyArgsByKey: argsByKey, bodyFields }
}
