/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AJV-based JSON Schema validation, replacing the Zod-based zod-error.ts.
 *
 * Uses ajv@6 (already installed) with allErrors + useDefaults.
 * Imported statically so `bun build --compile` embeds it; createRequire is
 * invisible to the bundler and leaves compiled binaries with a missing module.
 */

import Ajv from 'ajv'
import type { Ajv as AjvInstance, ValidateFunction } from 'ajv'

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
let _ajv: AjvInstance | null = null

// ponytail: deliberately not importing ajv's own `ErrorObject` type. Its
// `params` field is typed as a ~12-member union (ErrorParameters), which
// does not compile against the three params this module actually reads
// (missingProperty, allowedValues, additionalProperty) and has no index
// signature, so it isn't assignable to Record<string, unknown> either.
// This narrow view names only the fields consumed below.
interface AjvErrorView {
  keyword: string
  dataPath: string
  message?: string
  params?: {
    missingProperty?: string
    allowedValues?: unknown[]
    additionalProperty?: string
  }
}

function getAjv (): AjvInstance {
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
    // ponytail: these are ajv6/draft-07 options. `strict` and `validateSchema` mean
    // something different (or don't exist) on ajv8/draft2020-12 — `unknownFormats`
    // becomes the `formats` allowlist and `useDefaults` gains array-item semantics.
    // Re-check every option here if this codebase ever moves off ajv@6.
    _ajv = new Ajv({ allErrors: true, logger: false, useDefaults: true, validateSchema: false, unknownFormats: 'ignore' })
  }
  return _ajv
}

/**
 * Tokenizes an AJV v6 `dataPath` (e.g. `.tags[0].name` or `['weird.key']`)
 * into path segments, with array indices as numbers rather than strings.
 *
 * AJV v6 dataPath syntax: `.prop` for identifier-like keys, `[N]` for array
 * indices, and `['key']` for keys containing dots or other special chars.
 */
function tokenizePath (dataPath: string): PathSegment[] {
  const segments: PathSegment[] = []
  const re = /\[(\d+)\]|\['((?:[^'\\]|\\.)*)'\]|\.([^.[]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(dataPath)) !== null) {
    if (match[1] !== undefined) {
      segments.push(Number(match[1]))
    } else if (match[2] !== undefined) {
      segments.push(match[2].replace(/\\'/g, "'"))
    } else if (match[3] !== undefined) {
      segments.push(match[3])
    }
  }
  return segments
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
 * "should match some schema in anyOf". Only the deepest-path error matters.
 *
 * Strategy:
 * 1. Deduplicate by (path, message).
 * 2. Drop "should match some schema in anyOf" when another error exists at the same path.
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
    deduped.filter((e) => e.message !== 'should match some schema in anyOf').map((e) => e.path)
  )
  return deduped.filter((e) =>
    e.message !== 'should match some schema in anyOf' || !otherPaths.has(e.path)
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
    const rawPath = e.dataPath || ''
    const params = e.params ?? {}
    const pathArr = tokenizePath(rawPath)
    // AJV reports missing-required errors at the parent path; append the
    // missing property name so the path names the actual offending field.
    if (e.keyword === 'required' && typeof params.missingProperty === 'string') {
      pathArr.push(params.missingProperty)
    }
    return {
      code: e.keyword,
      path: rawPath || '(root)',
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
