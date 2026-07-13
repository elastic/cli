/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'
import {
  extractSchemaArgs as baseExtractSchemaArgs,
  toKebabCase,
  buildFlagKeyMap,
  validateSchemaArgs as baseValidateSchemaArgs,
  walkWrapperChain,
  readMetaField,
  type SchemaArgDefinition as BaseSchemaArgDefinition,
  type FlagKeyMap,
} from '@cli-schema/zod'

export type { FlagKeyMap }
export { toKebabCase, buildFlagKeyMap }

/** Valid routing destinations for a parameter derived from `found_in` Zod metadata. */
export type FoundIn = 'path' | 'query' | 'body'

/**
 * Represents a single CLI argument derived from a top-level key in a command's input schema.
 *
 * The generic shape (`schemaKey`, `cliFlag`, `type`, `required`, `defaultValue`, `description`,
 * `acceptsArrayForm`) comes from `@cli-schema/zod`'s `SchemaArgDefinition`; `foundIn` and
 * `parseStyle` are Elastic-specific enrichment attached below.
 */
export interface SchemaArgDefinition extends BaseSchemaArgDefinition {
  /** Routing destination derived from `.meta({found_in: ...})`, or `undefined` if absent */
  foundIn?: FoundIn

  /**
   * Marks args whose CLI string value needs a non-trivial transformation before reaching the wire.
   *
   * - `'sort-pairs'`: ES `Sort` fields — the help text advertises `<field>:<direction>` pairs (the URL
   *   query grammar), but the schema routes them through the request body, where ES expects
   *   `[{"field": "direction"}, ...]`. The CLI parses the colon syntax into that shape.
   */
  parseStyle?: 'sort-pairs'
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
  return readMetaField<FoundIn>(field, 'found_in')
}

/**
 * Returns true when `field`'s schema carries the given `id` in its Zod metadata anywhere
 * in its wrapper chain. Used to identify named schema shapes like `Sort` that need
 * destination-specific transformations.
 */
function schemaContainsId (field: z.ZodType, id: string): boolean {
  return walkWrapperChain(field, (n) => {
    const meta = n.meta() as Record<string, unknown> | null | undefined
    return meta?.id === id
  })
}

/** Enriches a base schema arg with Elastic's routing (`foundIn`) and parse-style metadata. */
export function enrichEsArg (field: z.ZodType): Pick<SchemaArgDefinition, 'foundIn' | 'parseStyle'> {
  const foundIn = extractFoundIn(field)
  const parseStyle = schemaContainsId(field, 'Sort') ? 'sort-pairs' as const : undefined
  return {
    ...(foundIn !== undefined && { foundIn }),
    ...(parseStyle !== undefined && { parseStyle }),
  }
}

/**
 * Extracts CLI argument definitions from a Zod object schema.
 * Each top-level key becomes a `SchemaArgDefinition` with its kebab-case flag name,
 * type, required status, default value, description, and Elastic's routing/parse-style
 * enrichment.
 *
 * Returns an empty array if `schema` is not a Zod object schema.
 */
export function extractSchemaArgs (schema: unknown): SchemaArgDefinition[] {
  return baseExtractSchemaArgs(schema, { enrich: enrichEsArg }) as SchemaArgDefinition[]
}

/** Reserved CLI flag names that schema keys must not collide with. */
const RESERVED_FLAGS = ['help', 'json', 'config-file', 'use-context', 'command-profile', 'input-file']

/**
 * Validates schema arguments for naming conflicts.
 * Throws if any `cliFlag` collides with a reserved flag or duplicates another arg's flag.
 * Called at command registration time for fail-fast detection.
 */
export function validateSchemaArgs (args: SchemaArgDefinition[]): void {
  baseValidateSchemaArgs(args, RESERVED_FLAGS)
}
