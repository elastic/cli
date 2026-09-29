/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** A resolved version target: a `[major, minor]` stack version or the literal `'serverless'`. */
export type AvailabilityTarget = [number, number] | 'serverless'

const VERSION_RE = /^\d+\.\d+(\.\d+)?$/

/**
 * Parses a raw version hint from config into an `AvailabilityTarget`.
 *
 * - `'serverless'` → `'serverless'`
 * - `'9.2'` or `'9.2.3'` → `[9, 2]` (patch discarded)
 * - anything else → `undefined`
 */
export function parseVersionHint (raw: string): [number, number] | 'serverless' | undefined {
  if (raw === 'serverless') return 'serverless'
  if (!VERSION_RE.test(raw)) return undefined
  const [major, minor] = raw.split('.').map(Number)
  return [major as number, minor as number]
}

/**
 * Returns true when `since` (a `MAJOR.MINOR.PATCH` string) is strictly newer
 * than the `[major, minor]` target. Fails open on malformed `since`.
 */
function sinceIsNewer (since: string, target: [number, number]): boolean {
  const parsed = parseVersionHint(since)
  if (parsed == null || parsed === 'serverless') return false // fail open
  const [sm, sn] = parsed
  const [tm, tn] = target
  return sm > tm || (sm === tm && sn > tn)
}

/**
 * Determines whether an API or property is available for the given target.
 *
 * @param xAvailability - The raw `x-availability` value from a JSON Schema node. May be absent or malformed.
 * @param target - The resolved target from config. `undefined` means no filtering.
 *
 * Semantics:
 * - No target → always available (today's full-superset behavior).
 * - Absent or malformed `x-availability` → available (fail open).
 * - Flavor gate: if `x-availability` has flavor keys, the target's flavor key must be present.
 *   A `[major, minor]` target implies `stack`; `'serverless'` implies `serverless`.
 * - Version gate (stack only): if `x-availability.stack.since` exists and is newer
 *   than the target minor, the item is excluded. Serverless targets skip this check.
 */
export function isAvailable (xAvailability: unknown, target: AvailabilityTarget | undefined): boolean {
  if (target == null) return true // no filtering
  if (xAvailability == null || typeof xAvailability !== 'object' || Array.isArray(xAvailability)) return true // fail open

  const av = xAvailability as Record<string, unknown>
  const flavor = target === 'serverless' ? 'serverless' : 'stack'

  // Flavor gate: x-availability has at least one key → it's a flavor allow-list
  const hasKeys = Object.keys(av).length > 0
  if (hasKeys && !(flavor in av)) return false

  // Version gate: stack targets only
  if (flavor === 'stack' && Array.isArray(target)) {
    const stackBlock = av['stack']
    if (stackBlock != null && typeof stackBlock === 'object' && !Array.isArray(stackBlock)) {
      const since = (stackBlock as Record<string, unknown>)['since']
      if (typeof since === 'string' && since.length > 0) {
        if (sinceIsNewer(since, target)) return false
      }
    }
  }

  return true
}

/**
 * Returns a shallow copy of `schema` with `properties` filtered by availability
 * and `required` pruned to match. When `target` is `undefined`, returns the schema unchanged.
 */
export function filterSchemaByAvailability (
  schema: Record<string, unknown>,
  target: AvailabilityTarget | undefined
): Record<string, unknown> {
  if (target == null) return schema
  const properties = schema['properties'] as Record<string, unknown> | undefined
  if (properties == null) return schema

  const filtered = Object.fromEntries(
    Object.entries(properties).filter(([, prop]) =>
      isAvailable((prop as Record<string, unknown>)['x-availability'], target)
    )
  )

  const required = Array.isArray(schema['required'])
    ? (schema['required'] as string[]).filter((k) => k in filtered)
    : undefined

  return {
    ...schema,
    properties: filtered,
    ...(Array.isArray(schema['required']) ? { required } : {}),
  }
}
