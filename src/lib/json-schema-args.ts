/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extracts CLI argument definitions from a plain JSON Schema object.
 *
 * Replaces the Zod-based schema-args.ts. Works with JSON Schema objects
 * as produced by @elastic/schemas (properties carry `x-found-in` routing).
 */

/**
 * Represents a single CLI argument derived from a top-level key in a command's input schema.
 */
export interface SchemaArgDefinition {
  /** Original key name as defined in the schema (e.g., `num_shards`, `refresh_interval`) */
  schemaKey: string

  /** Kebab-case flag name derived from `schemaKey` (e.g., `num-shards`, `refresh-interval`) */
  cliFlag: string

  /** Declared type from schema introspection */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum'

  /** Whether the field is required (no default, not optional) */
  required: boolean

  /** Default value from the schema, if any */
  defaultValue?: unknown

  /** Description from the schema, used in help text */
  description: string

  /** Routing destination derived from `x-found-in`, or `undefined` if absent */
  foundIn?: FoundIn

  /**
   * True when the schema accepts both a scalar and an array form.
   * CLI flag stays scalar for UX; bodies may need array form for comma-separated values.
   */
  acceptsArrayForm?: boolean

  /**
   * Marks args whose CLI string value needs a non-trivial transformation.
   * `'sort-pairs'`: ES Sort fields using `field:direction` syntax.
   */
  parseStyle?: 'sort-pairs'
}

/** Valid routing destinations for a parameter. */
export type FoundIn = 'path' | 'query' | 'body'

/**
 * A bidirectional mapping between kebab-case CLI flag names and original schema keys.
 */
export interface FlagKeyMap {
  /** Maps `cliFlag` -> `schemaKey` */
  toSchemaKey: Map<string, string>
  /** Maps `schemaKey` -> `cliFlag` */
  toCliFlag: Map<string, string>
}

/**
 * Converts a schema key to its kebab-case CLI flag name.
 *
 * @example
 * toKebabCase('num_shards')      // 'num-shards'
 * toKebabCase('refreshInterval') // 'refresh-interval'
 * toKebabCase('_source')         // 'source'
 */
export function toKebabCase (key: string): string {
  return key
    .replace(/^_+/, '')
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/** Minimal shape of a JSON Schema property entry. */
interface JsonSchemaProp {
  type?: string | string[]
  format?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  'x-found-in'?: string
  anyOf?: JsonSchemaProp[]
  oneOf?: JsonSchemaProp[]
  allOf?: JsonSchemaProp[]
  items?: JsonSchemaProp
  $ref?: string
  properties?: Record<string, JsonSchemaProp>
  additionalProperties?: unknown
  const?: unknown
}

/**
 * Resolves the CLI type from a JSON Schema property.
 * Returns `{ type, acceptsArrayForm }`.
 */
function resolveType (
  prop: JsonSchemaProp,
  defs: Record<string, JsonSchemaProp> = {}
): { type: SchemaArgDefinition['type']; acceptsArrayForm: boolean } {
  // enum values
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return { type: 'enum', acceptsArrayForm: false }
  }

  // anyOf / oneOf: resolve all non-array branches; prefer string over number-with-const (e.g. Duration | -1 | 0)
  const variants = prop.anyOf ?? prop.oneOf
  if (variants != null && variants.length > 0) {
    let hasArray = false
    let resolvedType: SchemaArgDefinition['type'] = 'string'
    let hasExplicitString = false
    for (const v of variants) {
      const { type: t } = resolveType(v, defs)
      if (t === 'array') {
        hasArray = true
      } else if (t === 'string') {
        resolvedType = 'string'
        hasExplicitString = true
      } else if (!hasExplicitString && (resolvedType === 'string' || v.const === undefined)) {
        resolvedType = t
      }
    }
    return { type: resolvedType, acceptsArrayForm: hasArray }
  }

  // Dereference $ref using top-level $defs
  if (prop.$ref != null) {
    const refName = prop.$ref.replace(/^#\/\$defs\//, '')
    const deferred = defs[refName]
    if (deferred != null) return resolveType(deferred, defs)
    return { type: 'string', acceptsArrayForm: false } // unknown ref → safe default
  }

  const rawType = Array.isArray(prop.type) ? prop.type[0] : prop.type

  if (rawType === 'array') return { type: 'array', acceptsArrayForm: false }
  if (rawType === 'boolean') return { type: 'boolean', acceptsArrayForm: false }
  if (rawType === 'integer' || rawType === 'number') return { type: 'number', acceptsArrayForm: false }
  if (rawType === 'object') return { type: 'object', acceptsArrayForm: false }
  if (rawType === 'string') return { type: 'string', acceptsArrayForm: false }

  // fallback
  return { type: 'string', acceptsArrayForm: false }
}

/**
 * Extracts CLI argument definitions from a JSON Schema object.
 *
 * Each top-level property in `schema.properties` becomes a `SchemaArgDefinition`.
 * Routing is read from `x-found-in`; required status from `schema.required`.
 *
 * Returns an empty array if `schema` is not a valid JSON Schema object.
 */
export function extractSchemaArgs (schema: unknown): SchemaArgDefinition[] {
  if (schema == null || typeof schema !== 'object') return []
  const s = schema as Record<string, unknown>
  const properties = s['properties'] as Record<string, JsonSchemaProp> | undefined
  if (properties == null) return []
  const defs = (s['$defs'] ?? {}) as Record<string, JsonSchemaProp>

  const requiredKeys = new Set<string>(
    Array.isArray(s['required']) ? s['required'] as string[] : []
  )

  const seenFlags = new Map<string, string>() // cliFlag -> first schemaKey seen
  return Object.entries(properties).filter(([key]) => {
    const flag = toKebabCase(key)
    // ponytail: skip reserved flags and duplicates from upstream schemas
    if (RESERVED_FLAGS.has(flag)) return false
    if (seenFlags.has(flag)) return false // skip duplicate flags
    seenFlags.set(flag, key)
    return true
  }).map(([key, prop]) => {
    const { type, acceptsArrayForm } = resolveType(prop, defs)
    const defaultValue = prop.default
    const isRequired = requiredKeys.has(key) && defaultValue === undefined
    const description = prop.description ?? ''
    const foundIn = prop['x-found-in'] as FoundIn | undefined

    // Sort fields: check if prop description or key suggests Sort semantics
    // (used by ES Sort body fields that need field:direction→object transformation)
    // ponytail: lightweight heuristic, not perfect but avoids loading $defs
    const isSortField = key === 'sort' && (foundIn === 'body' || foundIn === undefined)

    return {
      schemaKey: key,
      cliFlag: toKebabCase(key),
      type,
      required: isRequired,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      description,
      ...(foundIn !== undefined ? { foundIn } : {}),
      ...(acceptsArrayForm ? { acceptsArrayForm: true } : {}),
      ...(isSortField ? { parseStyle: 'sort-pairs' as const } : {}),
    }
  })
}

/**
 * Builds a bidirectional mapping between CLI flag names and schema keys.
 */
export function buildFlagKeyMap (args: SchemaArgDefinition[]): FlagKeyMap {
  const toSchemaKey = new Map<string, string>()
  const toCliFlag = new Map<string, string>()
  for (const arg of args) {
    toSchemaKey.set(arg.cliFlag, arg.schemaKey)
    toCliFlag.set(arg.schemaKey, arg.cliFlag)
  }
  return { toSchemaKey, toCliFlag }
}

/** Reserved CLI flag names that schema keys must not collide with. */
const RESERVED_FLAGS = new Set(['help', 'json', 'config-file', 'use-context', 'command-profile', 'input-file'])

/**
 * Validates schema arguments for naming conflicts.
 * Throws on reserved flag collision or duplicate flags.
 */
export function validateSchemaArgs (args: SchemaArgDefinition[]): void {
  const seen = new Set<string>()
  for (const arg of args) {
    if (RESERVED_FLAGS.has(arg.cliFlag)) {
      throw new Error(`Schema key "${arg.schemaKey}" collides with reserved flag "--${arg.cliFlag}"`)
    }
    if (seen.has(arg.cliFlag)) {
      throw new Error(`Duplicate CLI flag collision: multiple schema keys map to "--${arg.cliFlag}"`)
    }
    seen.add(arg.cliFlag)
  }
}
