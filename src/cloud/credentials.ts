/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Credential-safe handling for serverless project create / reset-credentials.
 *
 * The underlying cloud API returns admin credentials in the response body.
 * When the user passes `--save-as <context>` or `--credentials-file <path>`,
 * this module:
 *
 *   1. Extracts the credential fields (username/password).
 *   2. For `--save-as`: upserts a context in the main config and stores
 *      secrets in the OS keychain (via SecretStore). Redacts the credential
 *      fields in the returned JSON so they never reach stdout.
 *   3. For `--credentials-file`: writes a standalone single-context YAML
 *      fragment to the given path (0600 perms) and redacts stdout.
 *
 * Without those flags, behaviour is unchanged for backwards compatibility.
 */

import {
  readRawConfig,
  writeConfig,
  upsertContext,
  hasInlineSecrets,
  resolveConfigPath,
  type RawConfig,
  type RawContext,
} from '../config/writer.ts'
import { getSecretStore, type SecretStore } from '../config/secret-store.ts'
import type { JsonValue } from '../factory.ts'

const KEYCHAIN_SERVICE = 'elastic-cli'

const CREATE_PROJECT_RE = /^create-(?:elasticsearch|observability|security)-project$/
const RESET_CREDENTIALS_RE = /^reset-(?:elasticsearch|observability|security)-project-credentials$/

/** Returns true when `cmdName` is a serverless command that returns credentials. */
export function isCredentialCommand (cmdName: string): boolean {
  return CREATE_PROJECT_RE.test(cmdName) || RESET_CREDENTIALS_RE.test(cmdName)
}

/** Returns true when `cmdName` is reset-credentials (URL endpoints are absent). */
export function isResetCredentialsCommand (cmdName: string): boolean {
  return RESET_CREDENTIALS_RE.test(cmdName)
}

/** The flags this module cares about, pulled out of `parsed.options`. */
export interface CredentialPolicyOptions {
  saveAs?: string
  credentialsFile?: string
  force?: boolean
  configFile?: string
}

export function readCredentialPolicyOptions (
  options: Record<string, string | number | boolean>,
): CredentialPolicyOptions {
  const out: CredentialPolicyOptions = {}
  const saveAs = options['save-as']
  if (typeof saveAs === 'string' && saveAs.length > 0) out.saveAs = saveAs
  const credFile = options['credentials-file']
  if (typeof credFile === 'string' && credFile.length > 0) out.credentialsFile = credFile
  if (options['force'] === true) out.force = true
  const cfg = options['config-file']
  if (typeof cfg === 'string' && cfg.length > 0) out.configFile = cfg
  return out
}

/**
 * Shape of the response fields we care about. Everything is optional because
 * the API contract is schema-less at this layer and we handle what we find.
 */
interface CredentialFields {
  username?: string
  password?: string
}

interface EndpointFields {
  elasticsearch?: string
  kibana?: string
}

interface ExtractedProject {
  id?: string
  credentials: CredentialFields
  endpoints: EndpointFields
}

function isObj (v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function asString (v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function extractProjectFields (body: JsonValue): ExtractedProject {
  const out: ExtractedProject = { credentials: {}, endpoints: {} }
  if (!isObj(body)) return out
  const id = asString(body.id)
  if (id != null) out.id = id

  const credsSrc = isObj(body.credentials) ? body.credentials : body
  const u = asString(credsSrc.username)
  const p = asString(credsSrc.password)
  if (u != null) out.credentials.username = u
  if (p != null) out.credentials.password = p

  if (isObj(body.endpoints)) {
    const es = asString(body.endpoints.elasticsearch)
    const kb = asString(body.endpoints.kibana)
    if (es != null) out.endpoints.elasticsearch = es
    if (kb != null) out.endpoints.kibana = kb
  }

  return out
}

/**
 * Returns a new response with credential fields replaced by a short marker,
 * preserving the rest of the body (so callers still see endpoint URLs, ids,
 * and any other fields the API happens to return).
 */
export function redactCredentials (body: JsonValue, marker: string): JsonValue {
  if (!isObj(body)) return body
  const next: Record<string, JsonValue> = { ...body as Record<string, JsonValue> }
  if (isObj(next.credentials)) {
    const creds: Record<string, JsonValue> = { ...next.credentials as Record<string, JsonValue> }
    if (typeof creds.password === 'string') creds.password = marker
    next.credentials = creds
  }
  // top-level flattened shape
  if (typeof next.password === 'string') next.password = marker
  return next
}

/**
 * Builds a RawContext for a newly-created project from its endpoints +
 * credentials. Stores secrets in the keychain (or leaves them inline when
 * no store is available).
 */
interface BuildContextResult {
  context: RawContext
  inline: boolean
  storageKind: SecretStore['kind']
}

async function buildProjectContext (
  extracted: ExtractedProject,
  contextName: string,
  store: SecretStore,
): Promise<BuildContextResult> {
  const ctx: Record<string, unknown> = {}
  const { username, password } = extracted.credentials
  const storeAvailable = await store.isAvailable()

  const authForService = async (serviceFieldPath: string): Promise<Record<string, unknown> | undefined> => {
    if (username == null || password == null) return undefined
    const auth: Record<string, unknown> = { username }
    if (storeAvailable) {
      const account = `${contextName}:${serviceFieldPath}.auth.password`
      await store.put(KEYCHAIN_SERVICE, account, password)
      auth.password = store.resolverExpr(KEYCHAIN_SERVICE, account)
    } else {
      auth.password = password
    }
    return auth
  }

  if (extracted.endpoints.elasticsearch != null) {
    const block: Record<string, unknown> = { url: extracted.endpoints.elasticsearch }
    const auth = await authForService('elasticsearch')
    if (auth != null) block.auth = auth
    ctx.elasticsearch = block
  }
  if (extracted.endpoints.kibana != null) {
    const block: Record<string, unknown> = { url: extracted.endpoints.kibana }
    const auth = await authForService('kibana')
    if (auth != null) block.auth = auth
    ctx.kibana = block
  }

  return {
    context: ctx as RawContext,
    inline: !storeAvailable,
    storageKind: storeAvailable ? store.kind : 'none',
  }
}

/**
 * Updates an existing context's auth.password fields after a
 * reset-credentials call (which doesn't return endpoints).
 * Returns undefined if the context has no service blocks to update.
 */
async function replaceContextPasswords (
  existing: RawContext,
  contextName: string,
  credentials: CredentialFields,
  store: SecretStore,
): Promise<RawContext | undefined> {
  const { username, password } = credentials
  if (username == null || password == null) return undefined
  const storeAvailable = await store.isAvailable()
  const next: Record<string, unknown> = { ...existing as Record<string, unknown> }

  let touched = false
  for (const serviceKey of ['elasticsearch', 'kibana'] as const) {
    const block = next[serviceKey]
    if (!isObj(block)) continue
    const auth: Record<string, unknown> = { username }
    if (storeAvailable) {
      const account = `${contextName}:${serviceKey}.auth.password`
      await store.put(KEYCHAIN_SERVICE, account, password)
      auth.password = store.resolverExpr(KEYCHAIN_SERVICE, account)
    } else {
      auth.password = password
    }
    next[serviceKey] = { ...block, auth }
    touched = true
  }

  return touched ? (next as RawContext) : undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ApplyCredentialPolicyResult {
  body: JsonValue
  /** Non-stdout telemetry for human-friendly logging. */
  log: {
    mode: 'save-as' | 'credentials-file' | 'passthrough'
    contextName?: string
    credentialsFile?: string
    storage: SecretStore['kind']
    warnings: string[]
  }
}

/**
 * Applies the configured credential policy to a cloud API response.
 *
 * Preconditions:
 *   - `cmdName` must be a credential-bearing command (checked by the caller
 *     via {@link isCredentialCommand}); passing a non-matching name is a bug.
 *
 * Error semantics:
 *   - Context name collisions on `--save-as` without `--force` throw (the
 *     caller converts the throw to a structured JsonValue).
 *   - OS-level failures (keychain write, file write) propagate.
 */
export async function applyCredentialPolicy (
  cmdName: string,
  body: JsonValue,
  opts: CredentialPolicyOptions,
): Promise<ApplyCredentialPolicyResult> {
  if (opts.saveAs == null && opts.credentialsFile == null) {
    return {
      body,
      log: { mode: 'passthrough', storage: 'none', warnings: [] },
    }
  }

  const extracted = extractProjectFields(body)
  if (extracted.credentials.password == null) {
    // Nothing to redact or save; pass through untouched.
    return {
      body,
      log: { mode: 'passthrough', storage: 'none', warnings: [] },
    }
  }

  const store = await getSecretStore()
  const warnings: string[] = []
  const storeAvailable = await store.isAvailable()
  if (!storeAvailable) {
    warnings.push(
      'No OS secret store is available; credentials will be written inline to the config file (chmod 0600).'
    )
  }

  if (opts.saveAs != null) {
    return saveAsContext(cmdName, body, extracted, opts, store, warnings)
  }

  // opts.credentialsFile != null
  return saveAsCredentialsFile(cmdName, body, extracted, opts, store, warnings)
}

async function saveAsContext (
  cmdName: string,
  body: JsonValue,
  extracted: ExtractedProject,
  opts: CredentialPolicyOptions,
  store: SecretStore,
  warnings: string[],
): Promise<ApplyCredentialPolicyResult> {
  const contextName = opts.saveAs!
  const configPath = resolveConfigPath(opts.configFile)
  const config = await readRawConfig(configPath)

  let nextContext: RawContext | undefined
  if (isResetCredentialsCommand(cmdName)) {
    const existing = config.contexts[contextName]
    if (existing == null) {
      throw new Error(
        `--save-as requires an existing context for reset-credentials; context "${contextName}" not found in ${configPath}`
      )
    }
    nextContext = await replaceContextPasswords(existing, contextName, extracted.credentials, store)
    if (nextContext == null) {
      throw new Error(
        `context "${contextName}" has no elasticsearch/kibana service block to update with new credentials`
      )
    }
  } else {
    if (contextName in config.contexts && opts.force !== true) {
      throw new Error(`context "${contextName}" already exists. Pass --force to overwrite.`)
    }
    const built = await buildProjectContext(extracted, contextName, store)
    nextContext = built.context
  }

  let next = upsertContext(config, contextName, nextContext)
  if (next.current_context === '') {
    // First context ever; point current_context at it.
    next = { ...next, current_context: contextName }
  }

  const writeResult = await writeConfig(configPath, next, { restrictPermissions: hasInlineSecrets(next) })
  const storeAvailable = await store.isAvailable()

  const marker = storeAvailable ? `(saved to ${store.kind})` : '(saved inline to config)'
  const redacted = redactCredentials(body, marker)
  const annotated = annotateBody(redacted, { savedAs: contextName, configFile: writeResult.path })

  return {
    body: annotated,
    log: {
      mode: 'save-as',
      contextName,
      storage: storeAvailable ? store.kind : 'none',
      warnings: [...warnings, ...writeResult.warnings],
    },
  }
}

async function saveAsCredentialsFile (
  cmdName: string,
  body: JsonValue,
  extracted: ExtractedProject,
  opts: CredentialPolicyOptions,
  store: SecretStore,
  warnings: string[],
): Promise<ApplyCredentialPolicyResult> {
  const credentialsFile = opts.credentialsFile!
  // For reset-credentials without endpoints, we cannot build a complete
  // single-context fragment; refuse rather than write something broken.
  if (isResetCredentialsCommand(cmdName) && extracted.endpoints.elasticsearch == null && extracted.endpoints.kibana == null) {
    throw new Error(
      '--credentials-file is not supported for reset-credentials (response contains no endpoints). Use --save-as to update an existing context.'
    )
  }

  // The fragment is a single-context, self-contained config file.
  const contextName = opts.saveAs ?? (extracted.id ?? 'project')
  const built = await buildProjectContext(extracted, contextName, store)

  const fragment: RawConfig = {
    current_context: contextName,
    contexts: { [contextName]: built.context },
  }

  const { stat } = await import('node:fs/promises')
  if (opts.force !== true) {
    try {
      await stat(credentialsFile)
      throw new Error(`credentials file "${credentialsFile}" already exists. Pass --force to overwrite.`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  const writeResult = await writeConfig(credentialsFile, fragment, { restrictPermissions: true })
  const storeAvailable = await store.isAvailable()

  const redacted = redactCredentials(body, '(saved to file)')
  const annotated = annotateBody(redacted, { credentialsFile: writeResult.path })

  return {
    body: annotated,
    log: {
      mode: 'credentials-file',
      credentialsFile: writeResult.path,
      storage: storeAvailable ? store.kind : 'none',
      warnings: [...warnings, ...writeResult.warnings],
    },
  }
}

function annotateBody (body: JsonValue, extras: Record<string, string>): JsonValue {
  if (!isObj(body)) {
    return { result: body as JsonValue, ...(extras as Record<string, JsonValue>) }
  }
  return { ...(body as Record<string, JsonValue>), ...(extras as Record<string, JsonValue>) }
}
