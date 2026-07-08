/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from 'node:module'
import { BUILT_IN_PROFILES, type BuiltInProfile } from './profiles.ts'
import type {
  Auth,
  ServiceBlock,
  Context,
  ConfigFile,
  CommandPolicy,
} from './types.ts'

// ---------------------------------------------------------------------------
// AJV setup (lazy singleton)
// ---------------------------------------------------------------------------

type AjvValidateFunction = (data: unknown) => boolean
interface AjvInstance {
  compile(schema: Record<string, unknown>): AjvValidateFunction & { errors: unknown[] | null }
}

let _ajv: AjvInstance | undefined
function getAjv (): AjvInstance {
  if (_ajv == null) {
    const req = createRequire(import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Ajv = req('ajv') as new (opts: Record<string, unknown>) => AjvInstance
    // No removeAdditional — we strip unknown fields explicitly after validation.
    _ajv = new Ajv({ allErrors: true, strict: false, logger: false, useDefaults: true })
  }
  return _ajv
}

// Cache compiled validators by schema object identity to avoid re-compiling on every call.
const _compiled = new WeakMap<Record<string, unknown>, ReturnType<AjvInstance['compile']>>()
function compile (schema: Record<string, unknown>): ReturnType<AjvInstance['compile']> {
  let fn = _compiled.get(schema)
  if (fn == null) {
    fn = getAjv().compile(schema)
    _compiled.set(schema, fn)
  }
  return fn
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParseResult<T> = { success: true; data: T } | { success: false; errors: Array<{ path: string; message: string }> }

function ajvErrors (errs: unknown[] | null | undefined): Array<{ path: string; message: string }> {
  return (errs ?? []).map((e) => {
    const err = e as Record<string, unknown>
    return {
      path: String(err['dataPath'] ?? err['instancePath'] ?? ''),
      message: String(err['message'] ?? 'invalid'),
    }
  })
}

type ValidateResult = { ok: true; data: unknown } | { ok: false; errors: Array<{ path: string; message: string }> }

function validate (schema: Record<string, unknown>, input: unknown): ValidateResult {
  // Deep-clone so AJV mutations (useDefaults) don't affect the original.
  const copy = JSON.parse(JSON.stringify(input)) as unknown
  const fn = compile(schema)
  return fn(copy) ? { ok: true, data: copy } : { ok: false, errors: ajvErrors(fn.errors) }
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
    url: { type: 'string', pattern: '^https?://' },
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
    return { success: true, data: stripServiceBlock(r.data)! }
  },
}

/** Policy controlling which commands are permitted to run. */
export const CommandPolicySchema = {
  jsonSchema: commandPolicySchema,
  safeParse (input: unknown): ParseResult<CommandPolicy> {
    const r = validate(commandPolicySchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const p = stripCommandPolicy(r.data)!
    if (p.profile != null && p.allowed != null) {
      return { success: false, errors: [{ path: '', message: '"profile" and "allowed" are mutually exclusive' }] }
    }
    if (p.allowed != null && p.blocked != null) {
      return { success: false, errors: [{ path: '', message: '"allowed" and "blocked" are mutually exclusive' }] }
    }
    return { success: true, data: p }
  },
}

/** A context value: optional service blocks with at least one present. */
export const ContextSchema = {
  jsonSchema: contextSchema,
  safeParse (input: unknown): ParseResult<Context> {
    const r = validate(contextSchema, input)
    if (!r.ok) return { success: false, errors: r.errors }
    const ctx = stripContext(r.data)!
    if (ctx.elasticsearch == null && ctx.kibana == null && ctx.cloud == null) {
      return { success: false, errors: [{ path: '', message: 'at least one service block (elasticsearch, kibana, or cloud) is required' }] }
    }
    if (ctx.commands != null) {
      const cp = ctx.commands
      if (cp.profile != null && cp.allowed != null) {
        return { success: false, errors: [{ path: '.commands', message: '"profile" and "allowed" are mutually exclusive' }] }
      }
      if (cp.allowed != null && cp.blocked != null) {
        return { success: false, errors: [{ path: '.commands', message: '"allowed" and "blocked" are mutually exclusive' }] }
      }
    }
    return { success: true, data: ctx }
  },
}

/** The root configuration file structure. */
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
    }
    if (raw['commands'] != null) {
      const cp = stripCommandPolicy(raw['commands'])!
      if (cp.profile != null && cp.allowed != null) {
        return { success: false, errors: [{ path: '.commands', message: '"profile" and "allowed" are mutually exclusive' }] }
      }
      if (cp.allowed != null && cp.blocked != null) {
        return { success: false, errors: [{ path: '.commands', message: '"allowed" and "blocked" are mutually exclusive' }] }
      }
      cfg.commands = cp
    }
    return { success: true, data: cfg }
  },
}

/** Structural schema for first-pass validation (shape only, no deep context validation). */
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
