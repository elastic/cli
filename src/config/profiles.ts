/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in command profiles for deployment-aware API surface filtering.
 *
 * A profile resolves to an effective allow-list at config load time,
 * which then flows through the same `isCommandAllowed` / `hideBlockedCommands`
 * path as the manual `commands.allowed` policy.
 *
 * Built-in profiles:
 * - `serverless` — only commands that work on Elastic Serverless. Hides
 *   `cloud hosted` and exposes `cloud serverless` + all stack commands.
 * - `stack`      — full surface including self-managed / hosted-only APIs,
 *                  minus commands that only apply to Serverless projects.
 * - `default`    — alias for `serverless`; the most conservative baseline,
 *                  recommended for agents and LLM-based tooling.
 */

/** The set of valid built-in profile names. */
export const BUILT_IN_PROFILES = ['serverless', 'stack', 'default'] as const

/** Union of valid built-in profile name strings. */
export type BuiltInProfile = typeof BUILT_IN_PROFILES[number]

/** ES namespaces unavailable on Elasticsearch Serverless. */
const STACK_ONLY_ES_NAMESPACES = [
  'ccr',
  'dangling-indices',
  'ilm',
  'license',
  'logstash',
  'rollup',
  'searchable-snapshots',
  'slm',
  'snapshot',
  'ssl',
  'watcher',
] as const

/** Namespaces that only apply to Serverless projects (Nightshift: observability projects). */
const SERVERLESS_ONLY_NAMESPACES = ['nightshift'] as const

/**
 * Resolves a built-in profile to an effective allow/block policy.
 *
 * `allowed`, when present, is the complete allow-list; without it every command
 * not matched by `blocked` is allowed.
 */
export function resolveBuiltinProfile (name: BuiltInProfile): { allowed?: readonly string[]; blocked?: readonly string[] } {
  if (name === 'stack') return { blocked: SERVERLESS_ONLY_NAMESPACES.map(ns => `${ns}.*`) }

  // `default` is an alias for `serverless`
  return {
    allowed: [
      // CLI utilities — always visible regardless of deployment type
      'version',
      'docs.*',
      'config.*',
      'sanitize.*',

      // Top-level es/kb alias stubs (leaf nodes that redirect to stack.es/stack.kb)
      'es',
      'kb',

      // All stack commands (Elasticsearch + Kibana)
      'stack.*',

      ...SERVERLESS_ONLY_NAMESPACES.map(ns => `${ns}.*`),

      // Cloud cross-cutting namespaces (apply to both Hosted and Serverless)
      'cloud.trust.*',
      'cloud.auth.*',
      'cloud.orgs.*',
      'cloud.users.*',
      'cloud.billing.*',

      // Cloud Serverless management
      'cloud.serverless.*',

      // cloud.hosted.* is intentionally excluded from serverless/default profiles
    ],
    blocked: STACK_ONLY_ES_NAMESPACES.map(ns => `stack.es.${ns}.*`),
  }
}
