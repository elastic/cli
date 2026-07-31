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

/** Simplified validation issue for user-facing output. */
export interface ValidationError {
  /** Human-readable path string (e.g. ".index" or "(root)") */
  path: string
  /** Field path as array of keys (e.g. ["index"] or ["address", "zipCode"]) */
  path_array: string[]
  message: string
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
    // Convert AJV v6 dot-notation path to array of keys
    const pathArr = rawPath
      ? rawPath.replace(/^\./, '').split('.').filter(Boolean)
      : []
    return {
      path: rawPath || '(root)',
      path_array: pathArr,
      message: e.message ?? 'validation error',
    }
  })

  return { success: false, errors: deduplicateUnionErrors(raw) }
}

/**
 * Renders a list of validation errors as human-readable text.
 */
export function formatValidationErrors (errors: ValidationError[]): string {
  if (errors.length === 0) return '✖ Invalid input'
  return errors
    .map(e => `✖ ${e.message}\n  → at ${e.path}`)
    .join('\n')
}
