/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'

/**
 * Represents a single CLI argument derived from a top-level key in a command's input schema.
 */
export interface SchemaArgDefinition {
  /** Original key name as defined in the Zod schema (e.g., `num_shards`, `refreshInterval`) */
  schemaKey: string

  /** Kebab-case flag name derived from `schemaKey` (e.g., `num-shards`, `refresh-interval`) */
  cliFlag: string

  /** Declared type from schema introspection */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum'

  /** Whether the field is required (no default, not optional) */
  required: boolean

  /** Default value from the schema, if any */
  defaultValue?: unknown

  /** Description from the schema's metadata, used in help text */
  description: string

  /** Routing destination derived from `.meta({found_in: ...})`, or `undefined` if absent */
  foundIn?: FoundIn

  /**
   * True when the schema accepts both a scalar and an array form (e.g. `Fields = union(Field, array(Field))`).
   * Registered CLI flag is still scalar for UX; callers split comma-separated values into arrays where
   * the destination demands it (e.g. JSON request bodies).
   */
  acceptsArrayForm?: boolean

  /**
   * Marks args whose CLI string value needs a non-trivial transformation before reaching the wire.
   *
   * - `'sort-pairs'`: ES `Sort` fields — the help text advertises `<field>:<direction>` pairs (the URL
   *   query grammar), but the schema routes them through the request body, where ES expects
   *   `[{"field": "direction"}, ...]`. The CLI parses the colon syntax into that shape.
   */
  parseStyle?: 'sort-pairs'
}

/** Valid routing destinations for a parameter derived from `found_in` Zod metadata. */
export type FoundIn = 'path' | 'query' | 'body'

/**
 * A bidirectional mapping between kebab-case CLI flag names and original schema keys.
 */
export interface FlagKeyMap {
  /** Maps `cliFlag` -> `schemaKey` for reverse lookup during merge */
  toSchemaKey: Map<string, string>

  /** Maps `schemaKey` -> `cliFlag` for registration and help text */
  toCliFlag: Map<string, string>
}

/**
 * Converts a schema key to its kebab-case CLI flag name.
 * Handles snake_case, camelCase, and plain lowercase inputs.
 *
 * @example
 * ```ts
 * toKebabCase('num_shards')      // 'num-shards'
 * toKebabCase('refreshInterval') // 'refresh-interval'
 * toKebabCase('index')           // 'index'
 * ```
 */
export function toKebabCase (key: string): string {
  return key
    .replace(/^_+/, '') // strip leading underscores (e.g. Elasticsearch's _source, _meta)
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/** Minimal shape of a Zod field def for the properties we need to introspect. */
interface ZodFieldDef {
  type: string
  innerType?: { def: ZodFieldDef }
  defaultValue?: unknown
  getter?: () => z.ZodType
  options?: z.ZodType[]
}

/**
 * Unwraps wrapper types from a Zod schema field, resolving lazy thunks,
 * records, unions, and any/unknown to their CLI-appropriate type names.
 */
function unwrapField (field: z.ZodType): { typeName: string, isOptional: boolean, defaultValue?: unknown } {
  const def = field.def as ZodFieldDef
  if (def.type === 'date') {
    throw new Error('Date cannot be represented in JSON Schema: use z.string() with an ISO-8601 description instead of z.date()')
  }

  if (def.type === 'optional') {
    const inner = unwrapField(def.innerType as z.ZodType)
    return { ...inner, isOptional: true }
  }

  if (def.type === 'default') {
    const inner = unwrapField(def.innerType as z.ZodType)
    return { ...inner, defaultValue: def.defaultValue, isOptional: false }
  }

  if (def.type === 'lazy' && typeof def.getter === 'function') {
    return unwrapField(def.getter())
  }

  if (def.type === 'record' || def.type === 'any' || def.type === 'unknown') {
    return { typeName: 'object', isOptional: false }
  }

  if (def.type === 'union' && Array.isArray(def.options) && def.options.length > 0) {
    return unwrapField(def.options[0] as z.ZodType)
  }

  return { typeName: def.type, isOptional: false }
}

const CLI_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'enum'])

/**
 * Extracts CLI argument definitions from a Zod object schema.
 * Each top-level key becomes a `SchemaArgDefinition` with its kebab-case flag name,
 * type, required status, default value, and description.
 *
 * Returns an empty array if `schema` is not a Zod object schema.
 */
export function extractSchemaArgs (schema: unknown): SchemaArgDefinition[] {
  const shape = (schema as z.ZodObject<z.ZodRawShape> | null)?.shape
  if (shape == null || typeof shape !== 'object') return []

  return Object.entries(shape).map(([key, fieldSchema]) => {
    const { typeName, isOptional, defaultValue } = unwrapField(fieldSchema as z.ZodType)
    const type = (CLI_TYPES.has(typeName) ? typeName : 'string') as SchemaArgDefinition['type']

    // Read description from the Zod globalRegistry -- much faster than calling
    // .toJSONSchema() per field, which would force lazy-schema evaluation.
    // The outer field may carry found_in meta while the inner type (unwrapped from
    // optional/default) carries the description, so we check both levels.
    const outerMeta = (fieldSchema as z.ZodType).meta() as Record<string, unknown> | null | undefined
    let description: string = typeof outerMeta?.description === 'string' ? outerMeta.description : ''
    if (description === '') {
      const innerType = ((fieldSchema as z.ZodType).def as { innerType?: z.ZodType } | undefined)?.innerType
      if (innerType != null) {
        const innerMeta = innerType.meta() as Record<string, unknown> | null | undefined
        if (typeof innerMeta?.description === 'string') description = innerMeta.description
      }
    }

    const foundIn = extractFoundIn(fieldSchema as z.ZodType)
    const acceptsArrayForm = type !== 'array' && schemaAcceptsArrayForm(fieldSchema as z.ZodType)
    const parseStyle = schemaContainsId(fieldSchema as z.ZodType, 'Sort') ? 'sort-pairs' as const : undefined
    return {
      schemaKey: key,
      cliFlag: toKebabCase(key),
      type,
      required: !isOptional && defaultValue === undefined,
      defaultValue,
      description,
      ...(foundIn !== undefined ? { foundIn } : {}),
      ...(acceptsArrayForm ? { acceptsArrayForm: true } : {}),
      ...(parseStyle !== undefined ? { parseStyle } : {})
    }
  })
}

/**
 * Walks `field` through `optional`, `default`, `lazy`, and `union` wrappers, returning true
 * if `predicate` matches any visited node. The `seen` set breaks cycles in self-referential
 * lazy schemas (e.g. `z.lazy(() => Foo)` where `Foo` references itself).
 *
 * Note: evaluating `lazy.getter()` forces lazy-schema evaluation; the schemas this file
 * inspects make that unavoidable for predicates that depend on a lazy's inner shape.
 */
function anyNode (field: z.ZodType, predicate: (node: z.ZodType) => boolean): boolean {
  const seen = new Set<z.ZodType>()
  function walk (node: z.ZodType): boolean {
    if (seen.has(node)) return false
    seen.add(node)
    if (predicate(node)) return true
    const def = node.def as ZodFieldDef
    if (def.type === 'optional' || def.type === 'default') {
      return def.innerType != null && walk(def.innerType as unknown as z.ZodType)
    }
    if (def.type === 'lazy' && typeof def.getter === 'function') {
      return walk(def.getter())
    }
    if (def.type === 'union' && Array.isArray(def.options)) {
      return def.options.some((o) => walk(o))
    }
    return false
  }
  return walk(field)
}

/**
 * Returns true when `field`'s schema carries the given `id` in its Zod metadata anywhere
 * in its wrapper chain. Used to identify named schema shapes like `Sort` that need
 * destination-specific transformations.
 */
function schemaContainsId (field: z.ZodType, id: string): boolean {
  return anyNode(field, (n) => {
    const meta = n.meta() as Record<string, unknown> | null | undefined
    return meta?.id === id
  })
}

/**
 * Returns true when the schema (or any branch of its unions) accepts an array form.
 *
 * Elasticsearch commonly types fields as `union(T, array(T))` (e.g. `Fields`, `Indices`),
 * which `unwrapField` collapses to the scalar branch for CLI ergonomics. Body-routed
 * arguments still need the array form because ES does not split CSV strings inside JSON
 * bodies (only in querystrings and URL paths).
 */
function schemaAcceptsArrayForm (field: z.ZodType): boolean {
  return anyNode(field, (n) => (n.def as ZodFieldDef).type === 'array')
}

/**
 * Builds a bidirectional mapping between CLI flag names and schema keys for a command.
 * Created once at registration time; immutable after creation.
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
 * Throws if any `cliFlag` collides with a reserved flag or duplicates another arg's flag.
 * Called at command registration time for fail-fast detection.
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

/**
 * Extracts the `found_in` routing metadata from a Zod field.
 *
 * Reads `.meta()` from the outermost type first; if absent, walks one level into
 * wrapper types (`optional`, `default`) to find it on the inner type.
 *
 * @returns the routing destination, or `undefined` if no `found_in` metadata is present
 */
export function extractFoundIn (field: z.ZodType): FoundIn | undefined {
  // check outermost first
  const outerMeta = field.meta() as Record<string, unknown> | undefined
  if (outerMeta?.found_in != null) return outerMeta.found_in as FoundIn

  // walk one wrapper level (optional/default) to find meta on inner type
  const innerType = (field.def as { innerType?: z.ZodType }).innerType
  if (innerType != null) {
    const innerMeta = innerType.meta() as Record<string, unknown> | undefined
    if (innerMeta?.found_in != null) return innerMeta.found_in as FoundIn
  }

  return undefined
}
