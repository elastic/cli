/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateWithJsonSchema } from '../lib/ajv-validate.ts'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './profiles.ts'
import type {
  Auth,
  ServiceBlock,
  Context,
  ConfigFile,
  CommandPolicy,
} from './types.ts'

/**
 * JSON Schema-based validation for the configuration file.
 *
 * Schemas are organized from bottom-up:
 * 1. Auth schemas: `oneOf` union (api_key | basic) -- the variant is inferred from present fields
 * 2. ServiceBlock schema: url + auth
 * 3. Context schema: at least one service block (elasticsearch/kibana/cloud)
 * 4. ConfigFile root schema: current_context + contexts map + cross-field checks
 *
 * Unknown fields are stripped by the `strip*` helpers rather than by the schemas
 * themselves. Cross-field business rules (at-least-one-service, non-empty contexts
 * map, valid current_context key, URL scheme) are enforced in `safeParse` because
 * they cannot be expressed as plain JSON Schema constraints with useful messages.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParseResult<T> = { success: true; data: T } | { success: false; errors: Array<{ path: string; message: string }> }
type FieldError = { path: string; message: string }

/**
 * Resolves the value at an AJV path within `input`, so an error reported on a
 * sub-object can be re-described in terms of that object's contents.
 */
function valueAtPath (input: unknown, pathArray: Array<string | number>): unknown {
  let cur = input
  for (const key of pathArray) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[String(key)]
  }
  return cur
}

/** Restates a failed mutual-exclusion (`not`) constraint as the offending field pair. */
function mutualExclusionMessage (value: unknown): string | undefined {
  if (value == null || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if ('profile' in v && 'allowed' in v) return '"profile" and "allowed" are mutually exclusive'
  if ('allowed' in v && 'blocked' in v) return '"allowed" and "blocked" are mutually exclusive'
  return undefined
}

type ValidateResult = { ok: true; data: unknown } | { ok: false; errors: FieldError[] }

function validate (schema: Record<string, unknown>, input: unknown): ValidateResult {
  const r = validateWithJsonSchema(schema, input)
  if (r.success) return { ok: true, data: r.data }
  const errors = r.errors.map((e) => {
    const path = e.path === '(root)' ? '' : e.path
    if (e.code === 'not') {
      const message = mutualExclusionMessage(valueAtPath(input, e.path_array))
      if (message != null) return { path, message }
    }
    return { path, message: e.message }
  })
  return { ok: false, errors }
}

/**
 * Verifies a service URL is actually parseable and uses a supported scheme.
 * A JSON Schema `pattern` can only check the prefix, so bare values like
 * "https://" would otherwise reach the HTTP transport.
 */
function urlError (url: unknown, path: string): FieldError | undefined {
  if (typeof url !== 'string') return undefined // shape errors are AJV's job
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { path, message: 'must be a valid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { path, message: 'must use the http:// or https:// scheme' }
  }
  return undefined
}

/** Collects URL errors for every service block present on a context. */
function contextUrlErrors (raw: unknown, prefix: string): FieldError[] {
  if (raw == null || typeof raw !== 'object') return []
  const r = raw as Record<string, unknown>
  const errors: FieldError[] = []
  for (const service of ['elasticsearch', 'kibana', 'cloud'] as const) {
    const block = r[service]
    if (block == null || typeof block !== 'object') continue
    const err = urlError((block as Record<string, unknown>)['url'], `${prefix}.${service}.url`)
    if (err != null) errors.push(err)
  }
  return errors
}


// ---------------------------------------------------------------------------
// JSON Schemas (no additionalProperties — we strip manually)
// ---------------------------------------------------------------------------

const apiKeyAuthSchema: Record<string, unknown> = {
  type: 'object',
  properties: { api_key: { type: 'string', minLength: 1 } },
  required: ['api_key'],
}

const basicAuthSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 1 },
  },
  required: ['username', 'password'],
}

// oneOf without additionalProperties inside branches — avoids AJV v6 mutation bug.
const authSchema: Record<string, unknown> = {
  oneOf: [apiKeyAuthSchema, basicAuthSchema],
}

const serviceBlockSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    url: { type: 'string', minLength: 1 },
    auth: authSchema,
  },
  required: ['url'],
}

const commandPolicySchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    profile: { type: 'string', enum: [...BUILT_IN_PROFILES] },
    allowed: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    blocked: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
  },
  // draft-07: `allowed` may not coexist with `profile` or `blocked`.
  dependencies: {
    allowed: { not: { anyOf: [{ required: ['profile'] }, { required: ['blocked'] }] } },
  },
}

const contextSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    elasticsearch: serviceBlockSchema,
    kibana: serviceBlockSchema,
    cloud: serviceBlockSchema,
    commands: commandPolicySchema,
  },
}

const configFileSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    current_context: { type: 'string', minLength: 1 },
    contexts: {
      type: 'object',
      additionalProperties: contextSchema,
      minProperties: 1,
    },
    commands: commandPolicySchema,
    default_profile: { type: 'string', enum: [...BUILT_IN_PROFILES] },
    banner: { type: 'boolean' },
  },
  required: ['current_context', 'contexts'],
}

const structuralConfigSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    current_context: { type: 'string', minLength: 1 },
    contexts: {
      type: 'object',
      additionalProperties: { type: 'object' },
      minProperties: 1,
    },
    commands: { type: 'object' },
    default_profile: {},
    banner: { type: 'boolean' },
  },
  required: ['current_context', 'contexts'],
}

// ---------------------------------------------------------------------------
// Strip helpers: reconstruct typed objects from known fields only
// ---------------------------------------------------------------------------

function stripAuth (raw: unknown): Auth | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r['api_key'] === 'string') return { api_key: r['api_key'] }
  if (typeof r['username'] === 'string' && typeof r['password'] === 'string') {
    return { username: r['username'], password: r['password'] }
  }
  return undefined
}

function stripServiceBlock (raw: unknown): ServiceBlock | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: ServiceBlock = { url: r['url'] as string }
  if (r['auth'] != null) {
    const auth = stripAuth(r['auth'])
    if (auth != null) out.auth = auth
  }
  return out
}

function stripCommandPolicy (raw: unknown): CommandPolicy | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: CommandPolicy = {}
  if (typeof r['profile'] === 'string' && (BUILT_IN_PROFILES as readonly string[]).includes(r['profile'])) {
    out.profile = r['profile'] as BuiltInProfile
  }
  if (Array.isArray(r['allowed'])) out.allowed = r['allowed'] as string[]
  if (Array.isArray(r['blocked'])) out.blocked = r['blocked'] as string[]
  return out
}

function stripContext (raw: unknown): Context | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: Context = {}
  if (r['elasticsearch'] != null) {
    const v = stripServiceBlock(r['elasticsearch'])
    if (v != null) out.elasticsearch = v
  }
  if (r['kibana'] != null) {
    const v = stripServiceBlock(r['kibana'])
    if (v != null) out.kibana = v
  }
  if (r['cloud'] != null) {
    const v = stripServiceBlock(r['cloud'])
    if (v != null) out.cloud = v
  }
  if (r['commands'] != null) {
    const v = stripCommandPolicy(r['commands'])
    if (v != null) out.commands = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Exported schema objects — each exposes safeParse()
// ---------------------------------------------------------------------------

/** API key authentication credentials. */
export const ApiKeyAuthSchema = {
  safeParse (input: unknown): ParseResult<Auth> {
    const r = validate(apiKeyAuthSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const d = r.data as Record<string, unknown>
    return { success: true, data: { api_key: d['api_key'] as string } }
  },
}

/** Basic (username + password) authentication credentials. */
export const BasicAuthSchema = {
  safeParse (input: unknown): ParseResult<Auth> {
    const r = validate(basicAuthSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const d = r.data as Record<string, unknown>
    return { success: true, data: { username: d['username'] as string, password: d['password'] as string } as Auth }
  },
}

/** Union of all supported auth variants. */
export const AuthSchema = {
  safeParse (input: unknown): ParseResult<Auth> {
    const r = validate(authSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    return { success: true, data: stripAuth(r.data)! }
  },
}

/** Endpoint URL and authentication credentials for a single service. */
export const ServiceBlockSchema = {
  safeParse (input: unknown): ParseResult<ServiceBlock> {
    const r = validate(serviceBlockSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const block = stripServiceBlock(r.data)!
    const err = urlError(block.url, '.url')
    if (err != null) return { success: false, errors: [err] }
    return { success: true, data: block }
  },
}

/**
 * Policy controlling which commands are permitted to run.
 *
 * Mutually exclusive combinations:
 * - `profile` and `allowed` cannot both be set (profile replaces the allow-list)
 * - `allowed` and `blocked` cannot both be set
 *
 * Valid combinations:
 * - `profile` alone — use a built-in allow-list
 * - `profile` + `blocked` — built-in allow-list with additional restrictions
 * - `allowed` alone — explicit allow-list
 * - `blocked` alone — explicit deny-list (everything else is allowed)
 *
 * Entries may use a trailing wildcard (e.g. `stack.es.*`) to match a namespace.
 */
export const CommandPolicySchema = {
  jsonSchema: commandPolicySchema,
  safeParse (input: unknown): ParseResult<CommandPolicy> {
    const r = validate(commandPolicySchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    return { success: true, data: stripCommandPolicy(r.data)! }
  },
}

/**
 * A context value: optional service blocks with at least one present, plus
 * an optional per-context command policy that overrides the root-level policy.
 */
export const ContextSchema = {
  jsonSchema: contextSchema,
  safeParse (input: unknown): ParseResult<Context> {
    const r = validate(contextSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const ctx = stripContext(r.data)!
    if (ctx.elasticsearch == null && ctx.kibana == null && ctx.cloud == null) {
      return { success: false, errors: [{ path: '', message: 'at least one service block (elasticsearch, kibana, or cloud) is required' }] }
    }
    const urlErrors = contextUrlErrors(r.data, '')
    if (urlErrors.length > 0) return { success: false, errors: urlErrors }
    return { success: true, data: ctx }
  },
}

/**
 * The root configuration file structure.
 *
 * `default_profile` sets a fallback profile for all contexts that don't
 * specify their own `commands.profile`. It is overridden by a per-context
 * `commands.profile` and by the `--profile` CLI flag.
 *
 * `commands` is the root-level policy; per-context `commands` takes precedence.
 */
export const ConfigFileSchema = {
  safeParse (input: unknown): ParseResult<ConfigFile> {
    const r = validate(configFileSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const raw = r.data as Record<string, unknown>
    const cfg: ConfigFile = {
      current_context: raw['current_context'] as string,
      contexts: {},
    }
    if (typeof raw['banner'] === 'boolean') cfg.banner = raw['banner']
    if (typeof raw['default_profile'] === 'string' && (BUILT_IN_PROFILES as readonly string[]).includes(raw['default_profile'])) {
      cfg.default_profile = raw['default_profile'] as BuiltInProfile
    }
    // Parse contexts
    for (const [key, val] of Object.entries(raw['contexts'] as Record<string, unknown>)) {
      const ctx = stripContext(val)
      if (ctx != null) cfg.contexts[key] = ctx
    }
    // Cross-field checks
    if (!(cfg.current_context in cfg.contexts)) {
      return { success: false, errors: [{ path: '.current_context', message: 'must reference an existing context key' }] }
    }
    for (const [key, ctx] of Object.entries(cfg.contexts)) {
      if (ctx.elasticsearch == null && ctx.kibana == null && ctx.cloud == null) {
        return { success: false, errors: [{ path: `.contexts.${key}`, message: 'at least one service block required' }] }
      }
      const urlErrors = contextUrlErrors((raw['contexts'] as Record<string, unknown>)[key], `.contexts.${key}`)
      if (urlErrors.length > 0) return { success: false, errors: urlErrors }
    }
    if (raw['commands'] != null) {
      cfg.commands = stripCommandPolicy(raw['commands'])!
    }
    return { success: true, data: cfg }
  },
}

/**
 * Structural schema for first-pass validation before expression resolution.
 * Validates the outer config shape (current_context, contexts keys, commands)
 * without deeply validating context values (which may contain unresolved expressions).
 */
export const StructuralConfigSchema = {
  safeParse (input: unknown): ParseResult<{
    current_context: string
    contexts: Record<string, Record<string, unknown>>
    commands?: unknown
    default_profile?: unknown
    banner?: boolean
  }> {
    const r = validate(structuralConfigSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const raw = r.data as Record<string, unknown>
    return {
      success: true,
      data: {
        current_context: raw['current_context'] as string,
        contexts: raw['contexts'] as Record<string, Record<string, unknown>>,
        ...(raw['commands'] != null && { commands: raw['commands'] }),
        ...(raw['default_profile'] !== undefined && { default_profile: raw['default_profile'] }),
        ...(raw['banner'] !== undefined && { banner: raw['banner'] as boolean }),
      },
    }
  },
}
