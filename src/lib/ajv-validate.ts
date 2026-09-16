/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AJV-based JSON Schema validation, replacing the Zod-based zod-error.ts.
 *
 * Uses ajv@8 with allErrors + useDefaults.
 * Imported statically so `bun build --compile` embeds it; createRequire is
 * invisible to the bundler and leaves compiled binaries with a missing module.
 */

import { Ajv } from 'ajv'
import type { ValidateFunction } from 'ajv'

/** Path segment: property name, or array index (as a number). */
export type PathSegment = string | number

/** Minimal shape accepted by formatValidationErrors. */
interface FormattableError {
  /** Human-readable path string (e.g. ".index" or "(root)") */
  path: string
  message: string
}

/** Simplified validation issue for user-facing output. */
export interface ValidationError extends FormattableError {
  /** AJV's raw keyword (e.g. 'type', 'required', 'enum'), passed through as-is. */
  code: string
  /** Field path as array of keys/indices (e.g. ["index"] or ["tags", 0, "name"]) */
  path_array: PathSegment[]
}

/** Result of validateWithJsonSchema. */
export type ValidationResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: ValidationError[] }

// ponytail: module-level cache so AJV is initialised once per process
let _ajv: Ajv | null = null

// ponytail: deliberately not importing ajv's own `ErrorObject` type. Its
// `params` field is typed as a ~12-member union (ErrorParameters), which
// does not compile against the three params this module actually reads
// (missingProperty, allowedValues, additionalProperty) and has no index
// signature, so it isn't assignable to Record<string, unknown> either.
// This narrow view names only the fields consumed below.
interface AjvErrorView {
  keyword: string
  instancePath: string
  message?: string
  params?: {
    missingProperty?: string
    allowedValues?: unknown[]
    additionalProperty?: string
  }
}

function getAjv (): Ajv {
  if (_ajv == null) {
    // validateSchema: false — generated schemas contain cosmetic meta-schema violations
    // (e.g. nullable enums with a repeated `null`) that AJV would otherwise throw on
    // before validating any input.
    //
    // useDefaults is load-bearing: the hand-authored input schemas in src/es/helpers/
    // (bulk-ingest flush_bytes/concurrency/retries/retry_delay/source_format, msearch
    // batch_size/concurrency, watch sort_field/poll_interval/size) and src/docs/search.ts
    // (page/size) declare `default` values and their handlers destructure those fields as
    // non-optional. Removing this option would hand them `undefined`.
    //
    // ponytail: ajv@8 options. validateFormats: false suppresses errors about
    // unrecognized format keywords (replaces v6's unknownFormats: 'ignore').
    // strictSchema: false — suppresses 'unknown keyword' for x-found-in and other x- annotations.
    _ajv = new Ajv({ allErrors: true, logger: false, useDefaults: true, validateSchema: false, validateFormats: false, strictSchema: false })
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _ajv!
}

/**
 * Converts an AJV v8 JSON Pointer `instancePath` (e.g. `/tags/0/name`)
 * into path segments, with array indices as numbers rather than strings.
 *
 * JSON Pointer: segments separated by `/`, `~1` → `/`, `~0` → `~`.
 */
function tokenizePath (instancePath: string): PathSegment[] {
  if (!instancePath) return []
  return instancePath.split('/').slice(1).map(seg => {
    const s = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    const n = Number(s)
    return Number.isFinite(n) && String(n) === s ? n : s
  })
}

/**
 * Converts an AJV v8 JSON Pointer `instancePath` to legacy dot/bracket notation
 * (e.g. `/tags/0/name` → `.tags[0].name`, `/weird.key` → `['weird.key']`).
 * Used for the user-facing `path` string in ValidationError.
 */
function instancePathToLegacy (instancePath: string): string {
  if (!instancePath) return ''
  return instancePath.split('/').slice(1).map(seg => {
    const s = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    const n = Number(s)
    if (Number.isFinite(n) && String(n) === s) return `[${n}]`
    if (/^[a-zA-Z_$][\w$]*$/.test(s)) return `.${s}`
    return `['${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
  }).join('')
}

/**
 * Enriches an AJV error message with its `params`, where AJV's default
 * message omits information the params object already has (allowed enum
 * values, the unrecognized property name).
 */
function enrichMessage (keyword: string, message: string, params: NonNullable<AjvErrorView['params']>): string {
  switch (keyword) {
    case 'enum': {
      const allowed = params.allowedValues
      return Array.isArray(allowed) ? `${message}: ${allowed.join(', ')}` : message
    }
    case 'additionalProperties': {
      const prop = params.additionalProperty
      return typeof prop === 'string' ? `should NOT have additional property '${prop}'` : message
    }
    default:
      return message
  }
}

/**
 * Reduces AJV's verbose anyOf/union error list to the actionable subset.
 *
 * AJV with allErrors:true emits one error per anyOf branch plus a root-level
 * "must match a schema in anyOf". Only the deepest-path error matters.
 *
 * Strategy:
 * 1. Deduplicate by (path, message).
 * 2. Drop "must match a schema in anyOf" when another error exists at the same path.
 */
function deduplicateUnionErrors (errors: ValidationError[]): ValidationError[] {
  const seen = new Set<string>()
  const deduped = errors.filter((e) => {
    const key = `${e.path}\0${e.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const otherPaths = new Set(
    deduped.filter((e) => e.message !== 'must match a schema in anyOf').map((e) => e.path)
  )
  return deduped.filter((e) =>
    e.message !== 'must match a schema in anyOf' || !otherPaths.has(e.path)
  )
}

/**
 * Validates `input` against a JSON Schema object.
 *
 * Strips the `$schema` key before compiling (AJV v6 doesn't support 2020-12).
 * With `useDefaults: true`, missing fields with JSON Schema `default` values
 * are populated in-place on the returned `data` object.
 *
 * Returns a copy of input (with defaults applied) on success,
 * or a list of human-readable errors on failure.
 */
export function validateWithJsonSchema (
  schema: Record<string, unknown>,
  input: unknown
): ValidationResult {
  const { $schema, ...compilable } = schema as Record<string, unknown>
  void $schema // strip draft identifier AJV v6 doesn't understand

  // deep-clone input so defaults don't mutate the original object
  const data = JSON.parse(JSON.stringify(input ?? {})) as Record<string, unknown>

  const ajv = getAjv()
  let validate: ValidateFunction
  try {
    validate = ajv.compile(compilable as Record<string, unknown>)
  } catch (err) {
    // A malformed schema (bad regex, unresolvable $ref, etc.) throws from
    // ajv.compile rather than producing validation errors. Surface it through
    // the normal failure path instead of letting it become an uncaught exception.
    const title = typeof schema['title'] === 'string' ? schema['title'] : undefined
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      errors: [{
        code: 'schema_compile_failed',
        path: '(root)',
        path_array: [],
        message: title != null ? `schema "${title}" failed to compile: ${message}` : `schema failed to compile: ${message}`,
      }],
    }
  }
  // ajv's ValidateFunction can return a PromiseLike for async schemas ($data/$async
  // keywords), but this module only ever compiles synchronous schemas, so that arm
  // is unreachable here; narrow explicitly instead of relying on truthiness.
  const ok = validate(data) === true

  if (ok) return { success: true, data }

  // Single cast boundary: ajv's own `errors` type is `ErrorObject[] | null | undefined`,
  // where `ErrorObject.params` is intentionally not imported (see AjvErrorView above).
  const errors = (validate.errors ?? []) as unknown as AjvErrorView[]
  const raw: ValidationError[] = errors.map((e) => {
    const rawPath = e.instancePath || ''
    const params = e.params ?? {}
    const pathArr = tokenizePath(rawPath)
    let legacyPath = instancePathToLegacy(rawPath)
    // AJV reports missing-required errors at the parent path; append the
    // missing property name so the path names the actual offending field.
    if (e.keyword === 'required' && typeof params.missingProperty === 'string') {
      pathArr.push(params.missingProperty)
      const seg = params.missingProperty
      legacyPath += /^[a-zA-Z_$][\w$]*$/.test(seg) ? `.${seg}` : `['${seg}']`
    }
    return {
      code: e.keyword,
      path: legacyPath || '(root)',
      path_array: pathArr,
      message: enrichMessage(e.keyword, e.message ?? 'validation error', params),
    }
  })

  return { success: false, errors: deduplicateUnionErrors(raw) }
}

/**
 * Renders a list of validation errors as human-readable text.
 */
export function formatValidationErrors (errors: FormattableError[]): string {
  if (errors.length === 0) return '✖ Invalid input'
  return errors
    .map(e => `✖ ${e.message}\n  → at ${e.path}`)
    .join('\n')
}
