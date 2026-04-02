/**
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
}

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
export function toKebabCase(key: string): string {
  return key
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/** Minimal shape of a Zod field def for the properties we need to introspect. */
interface ZodFieldDef {
  type: string
  innerType?: { def: ZodFieldDef }
  defaultValue?: unknown
}

/**
 * Unwraps `optional` and `default` wrapper types from a Zod schema field,
 * returning the underlying type name, optional status, and default value.
 */
function unwrapField(field: z.ZodType): { typeName: string; isOptional: boolean; defaultValue?: unknown } {
  const def = field.def as ZodFieldDef

  if (def.type === 'optional') {
    const inner = unwrapField(def.innerType as z.ZodType)
    return { ...inner, isOptional: true }
  }

  if (def.type === 'default') {
    const inner = unwrapField(def.innerType as z.ZodType)
    return { ...inner, defaultValue: def.defaultValue, isOptional: false }
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
export function extractSchemaArgs(schema: unknown): SchemaArgDefinition[] {
  const shape = (schema as z.ZodObject<z.ZodRawShape> | null)?.shape
  if (shape == null || typeof shape !== 'object') return []

  return Object.entries(shape).map(([key, fieldSchema]) => {
    const { typeName, isOptional, defaultValue } = unwrapField(fieldSchema as z.ZodType)
    const type = (CLI_TYPES.has(typeName) ? typeName : 'string') as SchemaArgDefinition['type']

    let description = ''
    try {
      const js = (fieldSchema as z.ZodType).toJSONSchema()
      if (typeof js === 'object' && js !== null && 'description' in js && typeof js.description === 'string') {
        description = js.description
      }
    } catch {
      // schema types that don't support toJSONSchema get empty description
    }

    return {
      schemaKey: key,
      cliFlag: toKebabCase(key),
      type,
      required: !isOptional && defaultValue === undefined,
      defaultValue,
      description,
    }
  })
}

/**
 * Builds a bidirectional mapping between CLI flag names and schema keys for a command.
 * Created once at registration time; immutable after creation.
 */
export function buildFlagKeyMap(args: SchemaArgDefinition[]): FlagKeyMap {
  const toSchemaKey = new Map<string, string>()
  const toCliFlag = new Map<string, string>()
  for (const arg of args) {
    toSchemaKey.set(arg.cliFlag, arg.schemaKey)
    toCliFlag.set(arg.schemaKey, arg.cliFlag)
  }
  return { toSchemaKey, toCliFlag }
}

/** Reserved CLI flag names that schema keys must not collide with. */
const RESERVED_FLAGS = new Set(['help', 'version', 'format', 'config', 'context', 'file'])

/**
 * Validates schema arguments for naming conflicts.
 * Throws if any `cliFlag` collides with a reserved flag or duplicates another arg's flag.
 * Called at command registration time for fail-fast detection.
 */
export function validateSchemaArgs(args: SchemaArgDefinition[]): void {
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
