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

  /**
   * Kebab-case flag name derived from `schemaKey` (e.g., `num-shards`, `refresh-interval`).
   * Leading-underscore collisions (e.g. `_version` vs `version`) prefix the later key with `x-`.
   */
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
   * True when the schema marks this property with `x-body-root`, meaning its value
   * replaces the entire request body rather than nesting under the key.
   */
  bodyRoot?: boolean

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
  'x-body-root'?: boolean
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
  const rawVariants = prop.anyOf ?? prop.oneOf
  if (rawVariants != null && rawVariants.length > 0) {
    // Drop `null` so oneOf(array, null) is a plain array, not a string-with-array-form.
    const variants = rawVariants.filter((v) => {
      const t = Array.isArray(v.type) ? v.type[0] : v.type
      return t !== 'null'
    })
    if (variants.length === 1) return resolveType(variants[0]!, defs)
    if (variants.length === 0) return { type: 'string', acceptsArrayForm: false }
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

  // No type declared at all (e.g. `doc`): ES spec leaves these fully generic,
  // and CLI users pass JSON for them, so treat as object rather than string.
  if (rawType === undefined) return { type: 'object', acceptsArrayForm: false }

  // fallback for unrecognized type strings
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

  const entries = Object.entries(properties)
  const flagByKey = assignCliFlags(entries.map(([key]) => key))
  return entries.filter(([key]) => flagByKey.has(key)).map(([key, prop]) => {
    const { type, acceptsArrayForm } = resolveType(prop, defs)
    const defaultValue = prop.default
    const isRequired = requiredKeys.has(key) && defaultValue === undefined
    const description = prop.description ?? ''
    const foundIn = prop['x-found-in'] as FoundIn | undefined

    // Sort fields: check if prop description or key suggests Sort semantics
    // (used by ES Sort body fields that need field:direction→object transformation)
    const isSortField = key === 'sort' && (foundIn === 'body' || foundIn === undefined)

    return {
      schemaKey: key,
      cliFlag: flagByKey.get(key) as string,
      type,
      required: isRequired,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      description,
      ...(foundIn !== undefined ? { foundIn } : {}),
      ...(prop['x-body-root'] === true ? { bodyRoot: true } : {}),
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
 * Schema keys whose kebab-case name is a reserved Commander flag and cannot be exposed.
 * `help` is the cat.aliases column-list parameter; `--help` stays Commander's help.
 */
const KNOWN_RESERVED_FLAG_DROPS = new Set(['help'])

function isLeadingUnderscoreCollision (a: string, b: string): boolean {
  return toKebabCase(a) === toKebabCase(b) && a.startsWith('_') !== b.startsWith('_')
}

/**
 * Assigns a unique CLI flag to each schema key.
 * Leading-underscore collisions (`_version` vs `version`) keep the first-seen flag and prefix
 * the later key with `x-`. Other duplicate kebabs and reserved names still throw.
 * Returns no entry for keys in `KNOWN_RESERVED_FLAG_DROPS`.
 */
function assignCliFlags (keys: string[]): Map<string, string> {
  const flagByKey = new Map<string, string>()
  const keyByFlag = new Map<string, string>()
  for (const key of keys) {
    let flag = toKebabCase(key)
    if (RESERVED_FLAGS.has(flag)) {
      if (KNOWN_RESERVED_FLAG_DROPS.has(flag)) continue
      throw new Error(`Schema key "${key}" collides with reserved flag "--${flag}"`)
    }
    const first = keyByFlag.get(flag)
    if (first != null) {
      if (!isLeadingUnderscoreCollision(first, key)) {
        throw new Error(`Schema key "${key}" collides with existing CLI flag "--${flag}" (already mapped from "${first}")`)
      }
      flag = `x-${flag}`
      const taken = keyByFlag.get(flag)
      if (RESERVED_FLAGS.has(flag) || taken != null) {
        throw new Error(`Schema key "${key}" collides with existing CLI flag "--${flag}"${taken != null ? ` (already mapped from "${taken}")` : ''}`)
      }
    }
    keyByFlag.set(flag, key)
    flagByKey.set(key, flag)
  }
  return flagByKey
}

/**
 * Validates schema arguments for naming conflicts.
 * Throws on reserved flag collision or duplicate flags.
 *
 * `extractSchemaArgs` now performs this same check (throwing loudly on unreviewed collisions
 * before this function ever sees them), so on the production path this is unreachable for
 * `@elastic/schemas`-derived args. Kept as defense-in-depth for callers that hand-build
 * `SchemaArgDefinition[]` without going through `extractSchemaArgs`.
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
