/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { z } from 'zod'
import type {
  AuthSchema,
  ServiceBlockSchema,
  EsServiceBlockSchema,
  ContextSchema,
  ConfigFileSchema,
  CommandPolicySchema,
} from './schema.ts'
export type { BuiltInProfile } from './profiles.ts'

/**
 * TypeScript types exported from Zod schemas for the configuration system.
 *
 * These types are derived from their corresponding Zod schemas:
 * - Auth: Inferred union of authentication methods (api_key | basic)
 * - ServiceBlock: A service endpoint with auth (url + auth)
 * - Context: A collection of optional service blocks (elasticsearch, kibana, cloud)
 * - ConfigFile: The root config file structure (current_context + contexts map)
 * - ResolvedContext: The active context with only its configured service blocks
 * - ResolvedConfig: Typed config passed to command handlers, wrapping ResolvedContext
 */

/** Union of all supported authentication variants -- inferred from present fields. */
export type Auth = z.infer<typeof AuthSchema>

/** Endpoint URL and authentication credentials for a single service. */
export type ServiceBlock = z.infer<typeof ServiceBlockSchema>

/** The Elasticsearch service block: a direct connection, or routed through Kibana. */
export type EsServiceBlock = z.infer<typeof EsServiceBlockSchema>

/** An Elasticsearch block whose requests are forwarded by Kibana's Console proxy. */
export interface EsViaKibanaBlock { via: 'kibana' }

/** A context value: optional service blocks with at least one present. */
export type Context = z.infer<typeof ContextSchema>

/** The root configuration file structure. */
export type ConfigFile = z.infer<typeof ConfigFileSchema>

/** Policy controlling which commands are permitted to run. */
export type CommandPolicy = z.infer<typeof CommandPolicySchema>

/** The active context after resolution — only its configured service blocks, no extras. */
export interface ResolvedContext {
  elasticsearch?: EsServiceBlock
  kibana?: ServiceBlock
  cloud?: ServiceBlock
}

/**
 * Narrows an Elasticsearch block to the Kibana-routed variant.
 *
 * The schema guarantees `via` and `url` are mutually exclusive, so this doubles as
 * a check that no direct endpoint is available.
 */
export function isEsViaKibana (block: EsServiceBlock): block is EsViaKibanaBlock {
  return block.via === 'kibana'
}

/**
 * Narrows an Elasticsearch block to the direct-connection variant, whose `url` is
 * guaranteed present by the schema.
 */
export function isEsDirect (block: EsServiceBlock): block is ServiceBlock {
  return block.url != null
}

/** Typed configuration object passed to command handlers after loading and context resolution. */
export interface ResolvedConfig {
  context: ResolvedContext
  /** Optional command allow/deny policy from the config file. */
  commands?: CommandPolicy
  /** Whether to show the startup banner. Defaults to true when absent. */
  banner?: boolean
}
