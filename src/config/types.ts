/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BuiltInProfile } from './profiles.ts'
export type { BuiltInProfile } from './profiles.ts'

/**
 * TypeScript types for the configuration system.
 */

/** API key authentication credentials. */
export interface ApiKeyAuth {
  api_key: string
}

/** Basic (username + password) authentication credentials. */
export interface BasicAuth {
  username: string
  password: string
}

/** Union of all supported authentication variants. */
export type Auth = ApiKeyAuth | BasicAuth

/** Endpoint URL and authentication credentials for a single service. */
export interface ServiceBlock {
  url: string
  auth?: Auth
}

/** Policy controlling which commands are permitted to run. */
export interface CommandPolicy {
  profile?: BuiltInProfile
  allowed?: string[]
  blocked?: string[]
}

/** A context value: optional service blocks with at least one present. */
export interface Context {
  elasticsearch?: ServiceBlock
  kibana?: ServiceBlock
  cloud?: ServiceBlock
  commands?: CommandPolicy
}

/** The root configuration file structure. */
export interface ConfigFile {
  current_context: string
  contexts: Record<string, Context>
  commands?: CommandPolicy
  default_profile?: BuiltInProfile
  banner?: boolean
}

/** The active context after resolution — only its configured service blocks, no extras. */
export interface ResolvedContext {
  elasticsearch?: ServiceBlock
  kibana?: ServiceBlock
  cloud?: ServiceBlock
}

/** Typed configuration object passed to command handlers after loading and context resolution. */
export interface ResolvedConfig {
  context: ResolvedContext
  /** Optional command allow/deny policy from the config file. */
  commands?: CommandPolicy
  /** Whether to show the startup banner. Defaults to true when absent. */
  banner?: boolean
}
