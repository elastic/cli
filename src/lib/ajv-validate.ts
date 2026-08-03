/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AJV-based JSON Schema validation, replacing the Zod-based zod-error.ts.
 *
 * Uses ajv@6 (already installed) with allErrors + useDefaults.
 * Lazy-loads ajv to keep --help fast.
 */

import { createRequire } from 'node:module'

const _req = createRequire(import.meta.url)

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

interface AjvInstance {
  compile: (schema: Record<string, unknown>) => ValidateFn
}

interface ValidateFn {
  (data: unknown): boolean
  errors: AjvError[] | null
}

interface AjvError {
  keyword: string
  dataPath: string
  message?: string
  params?: Record<string, unknown>
}

function getAjv (): AjvInstance {
  if (_ajv == null) {
     
    const Ajv = _req('ajv') as new (opts: Record<string, unknown>) => AjvInstance
    // validateSchema: false — generated schemas contain cosmetic meta-schema violations
    // (e.g. nullable enums with a repeated `null`) that AJV would otherwise throw on
    // before validating any input.
    _ajv = new Ajv({ allErrors: true, strict: false, logger: false, useDefaults: true, validateSchema: false })
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
function enrichMessage (keyword: string, message: string, params: Record<string, unknown>): string {
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
  const validate = ajv.compile(compilable as Record<string, unknown>)
  const ok = validate(data)

  if (ok) return { success: true, data }

  const raw: ValidationError[] = (validate.errors ?? []).map((e) => {
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
