/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsApiDefinition } from '../../src/es/types.ts'
import type {
  TestFile, Step, DoStep, SetStep, MatchStep,
  IsTrueStep, IsFalseStep, LengthStep,
  GtStep, GteStep, LtStep, LteStep, ContainsStep
} from './types.ts'
import { buildActionMap, mapAction } from './mapper.ts'
import type { MappedAction } from './mapper.ts'

export interface GenerateResult {
  /** bash script content */
  script: string
  /** actions that couldn't be mapped (missing from CLI registry) */
  skippedActions: string[]
  /** true if the file was skipped entirely (e.g. all actions unmapped) */
  skipped: boolean
}

/**
 * Generate a bash test script from a parsed YAML test file.
 */
export function generateScript (
  testFile: TestFile,
  definitions: EsApiDefinition[]
): GenerateResult {
  const actionMap = buildActionMap(definitions)
  const skippedActions: string[] = []
  const lines: string[] = []

  lines.push('#!/bin/bash')
  lines.push(`# Generated from ${testFile.sourceFile}`)
  lines.push('set -euo pipefail')
  lines.push('')
  lines.push('exec < /dev/null')
  lines.push('ELASTIC="elastic --json"')
  lines.push('RESPONSE=""')
  lines.push('')

  if (testFile.teardown.length > 0) {
    lines.push('teardown() {')
    const teardownStart = lines.length
    renderSteps(testFile.teardown, actionMap, lines, skippedActions, '  ')
    if (!hasExecutableLine(lines.slice(teardownStart))) {
      lines.push('  :')
    }
    lines.push('}')
    lines.push('trap teardown EXIT')
    lines.push('')
  }

  if (testFile.setup.length > 0) {
    lines.push('# --- Setup ---')
    renderSteps(testFile.setup, actionMap, lines, skippedActions, '')
    lines.push('')
  }

  for (const section of testFile.tests) {
    lines.push(`# --- Test: ${section.name} ---`)
    renderSteps(section.steps, actionMap, lines, skippedActions, '')
    lines.push('')
  }

  lines.push(`echo "PASS: ${testFile.sourceFile}"`)

  const hasDoSteps = testFile.tests.some((s) =>
    s.steps.some((st) => st.kind === 'do')
  ) || testFile.setup.some((st) => st.kind === 'do')

  const allDoStepsSkipped = hasDoSteps && skippedActions.length > 0 &&
    countDoSteps(testFile) === skippedActions.length

  return {
    script: lines.join('\n') + '\n',
    skippedActions,
    skipped: allDoStepsSkipped
  }
}

/**
 * Generate the run.sh runner script that executes all generated test scripts.
 */
export function generateRunner (scriptPaths: string[]): string {
  const lines: string[] = []
  lines.push('#!/bin/bash')
  lines.push('# Runner for generated functional tests')
  lines.push('set -euo pipefail')
  lines.push('')
  lines.push('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"')
  lines.push('PASSED=0')
  lines.push('FAILED=0')
  lines.push('ERRORS=""')
  lines.push('')

  for (const p of scriptPaths) {
    lines.push(`if bash "$SCRIPT_DIR/${p}"; then`)
    lines.push('  PASSED=$((PASSED + 1))')
    lines.push('else')
    lines.push('  FAILED=$((FAILED + 1))')
    lines.push(`  ERRORS="$ERRORS\\n  FAIL: ${p}"`)
    lines.push('fi')
    lines.push('')
  }

  lines.push('echo ""')
  lines.push('echo "================================"')
  lines.push('echo "Results: $PASSED passed, $FAILED failed"')
  lines.push('if [ "$FAILED" -gt 0 ]; then')
  lines.push('  echo -e "Failures:$ERRORS"')
  lines.push('  exit 1')
  lines.push('fi')
  lines.push('echo "================================"')

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Internal rendering helpers
// ---------------------------------------------------------------------------

/**
 * A bash function body must contain at least one executable statement.
 * Returns true if any of the given lines is something other than a blank
 * line or a shell comment.
 */
function hasExecutableLine (lines: string[]): boolean {
  return lines.some((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('#')
  })
}

function renderSteps (
  steps: Step[],
  actionMap: Map<string, EsApiDefinition>,
  lines: string[],
  skippedActions: string[],
  indent: string
): void {
  // Assertions and set-steps read $RESPONSE, which is written by the most
  // recent successful `do`. If the last `do` was skipped (unmapped action,
  // unsupported catch, etc.) $RESPONSE is stale or empty, so any assertion
  // that follows would assert against the wrong data — skip those too
  // until the next executed `do` resets the response.
  let responseFromLastDo = false
  // Track bash variable names that were never assigned (set step was skipped).
  // Do-steps that reference these variables in params are skipped to avoid
  // "unbound variable" errors from set -u.
  const unsetVars = new Set<string>()

  for (const step of steps) {
    if (step.kind === 'do') {
      // Check if any param/body value (recursively) references an unset variable
      const referencesUnset = valueReferencesUnset(step.params, unsetVars) ||
        (step.body != null && valueReferencesUnset(step.body, unsetVars))
      if (referencesUnset) {
        lines.push(`${indent}# SKIPPED: step references undefined variable from skipped set`)
        responseFromLastDo = false
        continue
      }
      responseFromLastDo = renderDo(step, actionMap, lines, skippedActions, indent)
      continue
    }
    if (step.kind === 'skip') continue

    if (!responseFromLastDo) {
      if (step.kind === 'set') {
        // Track variables that won't be set
        for (const varName of Object.values(step.assignments)) {
          unsetVars.add(varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
        }
      }
      lines.push(`${indent}# SKIPPED: ${step.kind} assertion follows skipped do-step`)
      continue
    }

    switch (step.kind) {
      case 'set':
        renderSet(step, lines, indent)
        // If a variable was previously unset, it's now set
        for (const varName of Object.values(step.assignments)) {
          unsetVars.delete(varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
        }
        break
      case 'match':
        renderMatch(step, lines, indent)
        break
      case 'is_true':
        renderIsTrue(step, lines, indent)
        break
      case 'is_false':
        renderIsFalse(step, lines, indent)
        break
      case 'length':
        renderLength(step, lines, indent)
        break
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        renderComparison(step, lines, indent)
        break
      case 'contains':
        renderContains(step, lines, indent)
        break
    }
  }
}

/**
 * Render a do-step. Returns true if an executable command was emitted and
 * $RESPONSE will hold the result afterwards; false when the step was
 * skipped (unsupported catch or unmapped action) and $RESPONSE is now
 * stale/empty.
 */
function renderDo (
  step: DoStep,
  actionMap: Map<string, EsApiDefinition>,
  lines: string[],
  skippedActions: string[],
  indent: string
): boolean {
  if (step.catch != null) {
    lines.push(`${indent}# SKIPPED: catch not supported in MVP (catch: ${step.catch})`)
    return false
  }

  if (step.headers != null) {
    lines.push(`${indent}# NOTE: headers not supported by CLI (${Object.keys(step.headers).join(', ')})`)
  }

  const mapped = mapAction(step.action, step.params, actionMap)
  if (mapped == null) {
    skippedActions.push(step.action)
    lines.push(`${indent}# SKIPPED: action "${step.action}" not registered in CLI`)
    return false
  }

  const cmd = buildCommand(mapped, step)

  if (step.ignore != null && step.ignore.length > 0) {
    lines.push(`${indent}RESPONSE=$(${cmd}) || true`)
  } else {
    lines.push(`${indent}RESPONSE=$(${cmd})`)
  }
  return true
}

function buildCommand (mapped: MappedAction, step: DoStep): string {
  const args = mapped.cliArgs.map(shellEscape).join(' ')
  let base = `$ELASTIC ${args}`

  // Pass body fields as individual CLI flags.
  if (step.body != null) {
    const extraArgs: string[] = []

    if (Array.isArray(step.body)) {
      // Array bodies (e.g. bulk operations) — the whole array maps to the
      // single body arg (e.g. --operations).
      const arrayArgDef = [...mapped.bodyArgsByKey.values()].find(
        (a) => a.foundIn === 'body'
      )
      if (arrayArgDef != null) {
        extraArgs.push(`--${arrayArgDef.cliFlag}`, toShellArg(step.body))
      }
    } else {
      // Object bodies — try matching each top-level key to a body schema arg.
      const body = step.body as Record<string, unknown>
      const matched: string[] = []
      for (const [key, value] of Object.entries(body)) {
        const argDef = mapped.bodyArgsByKey.get(key)
        if (argDef == null || argDef.foundIn !== 'body') continue
        matched.push(key)
        extraArgs.push(`--${argDef.cliFlag}`, toShellArg(value))
      }
      // If no top-level keys matched body fields, the entire body is a freeform
      // document (e.g. `index` where the body IS the document). Pass it to the
      // single body arg (e.g. --document).
      if (matched.length === 0) {
        const singleBodyArg = [...mapped.bodyArgsByKey.values()].find(
          (a) => a.foundIn === 'body'
        )
        if (singleBodyArg != null) {
          extraArgs.push(`--${singleBodyArg.cliFlag}`, toShellArg(step.body))
        }
      }
    }

    if (extraArgs.length > 0) {
      base = `${base} ${extraArgs.join(' ')}`
    }
  }

  return base
}

function renderSet (step: SetStep, lines: string[], indent: string): void {
  for (const [responsePath, varName] of Object.entries(step.assignments)) {
    const bashVar = varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const jqPath = toJqPath(responsePath)
    lines.push(`${indent}${bashVar}=$(echo "$RESPONSE" | jq -r '${jqPath}')`)
  }
}

function renderMatch (step: MatchStep, lines: string[], indent: string): void {
  for (const [path, expected] of Object.entries(step.assertions)) {
    renderMatchValue(path, expected, lines, indent)
  }
}

function renderMatchValue (path: string, expected: unknown, lines: string[], indent: string): void {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    // Recursively expand object assertions into per-leaf checks
    for (const [key, val] of Object.entries(expected as Record<string, unknown>)) {
      const subPath = path === '' ? key : `${path}.${key}`
      renderMatchValue(subPath, val, lines, indent)
    }
    return
  }

  // Safe label for error messages: escape $ to avoid unintended variable expansion
  const safeLabel = path.replace(/\$/g, '\\$')

  // Detect YAML regex pattern /.../ — use bash =~ operator
  if (typeof expected === 'string' && expected.startsWith('/') && expected.endsWith('/')) {
    const pattern = expected.slice(1, -1)
    const jqPath = toJqPath(path)
    // Skip $body regex matches — they test raw text format, not applicable in JSON mode
    if (path === '$body' || path === '') {
      lines.push(`${indent}# SKIPPED: regex match on response body (text-format assertion)`)
      return
    }
    lines.push(`${indent}[[ "$(echo "$RESPONSE" | jq -r '${jqPath}')" =~ ${pattern} ]] || { echo 'FAIL: expected ${safeLabel} to match /${pattern}/'; exit 1; }`)
    return
  }

  const jqPath = toJqPath(path)
  const expectedStr = resolveExpectedValue(expected)

  if (typeof expected === 'number') {
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "${expected}" ] || { echo "FAIL: expected ${safeLabel} = ${expected}"; exit 1; }`)
  } else if (typeof expected === 'boolean') {
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "${String(expected)}" ] || { echo "FAIL: expected ${safeLabel} = ${String(expected)}"; exit 1; }`)
  } else {
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq -r '${jqPath}')" = ${expectedStr} ] || { echo "FAIL: expected ${safeLabel} = ${expectedStr}"; exit 1; }`)
  }
}

function renderIsTrue (step: IsTrueStep, lines: string[], indent: string): void {
  if (step.field === '') {
    lines.push(`${indent}[ -n "$RESPONSE" ] || { echo "FAIL: expected non-empty response"; exit 1; }`)
  } else {
    const jqPath = toJqPath(step.field)
    lines.push(`${indent}echo "$RESPONSE" | jq -e '${jqPath}' > /dev/null || { echo "FAIL: expected ${step.field} to be truthy"; exit 1; }`)
  }
}

function renderIsFalse (step: IsFalseStep, lines: string[], indent: string): void {
  if (step.field === '') {
    // Accept empty, "false", or "null" — CLI uses "false" for failed HEAD requests
    lines.push(`${indent}{ [ -z "$RESPONSE" ] || [ "$RESPONSE" = "false" ] || [ "$RESPONSE" = "null" ]; } || { echo "FAIL: expected empty/false response"; exit 1; }`)
  } else {
    const jqPath = toJqPath(step.field)
    lines.push(`${indent}echo "$RESPONSE" | jq -e '(${jqPath}) == null or (${jqPath}) == false' > /dev/null || { echo "FAIL: expected ${step.field} to be falsy"; exit 1; }`)
  }
}

function renderLength (step: LengthStep, lines: string[], indent: string): void {
  for (const [path, expected] of Object.entries(step.assertions)) {
    const jqPath = toJqPath(path)
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath} | length')" = "${expected}" ] || { echo "FAIL: expected ${path} length = ${expected}"; exit 1; }`)
  }
}

const COMPARISON_OPS: Record<string, string> = {
  gt: '-gt',
  gte: '-ge',
  lt: '-lt',
  lte: '-le'
}

function renderComparison (step: GtStep | GteStep | LtStep | LteStep, lines: string[], indent: string): void {
  const op = COMPARISON_OPS[step.kind]
  const label = step.kind
  for (const [path, expected] of Object.entries(step.assertions)) {
    const jqPath = toJqPath(path)
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" ${op} "${expected}" ] || { echo "FAIL: expected ${path} ${label} ${expected}"; exit 1; }`)
  }
}

function renderContains (step: ContainsStep, lines: string[], indent: string): void {
  for (const [path, expected] of Object.entries(step.assertions)) {
    const jqPath = toJqPath(path)
    const expectedJson = JSON.stringify(expected)
    lines.push(`${indent}echo "$RESPONSE" | jq -e '${jqPath} | contains([${escapeSingleQuotes(expectedJson)}])' > /dev/null || { echo "FAIL: expected ${path} to contain ${expectedJson}"; exit 1; }`)
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Convert a dotted response path to a jq expression.
 * Handles numeric indices (e.g. "hits.hits.0._source.name" -> ".hits.hits[0]._source.name")
 */
/**
 * Convert a YAML value to a CLI flag argument string.
 * Strings are passed raw; objects and arrays are JSON-encoded so the CLI
 * can parse them with z.any() / z.array() schemas.
 * Returns `null` for variable references which need special bash quoting.
 */
function toArgValue (value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * Recursively check if any string value in `val` is a bash variable reference
 * (starts with `$`) pointing to a variable in `unsetVars`.
 */
function valueReferencesUnset (val: unknown, unsetVars: Set<string>): boolean {
  if (typeof val === 'string' && val.startsWith('$')) {
    const varName = val.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '_')
    return unsetVars.has(varName)
  }
  if (Array.isArray(val)) return val.some((v) => valueReferencesUnset(v, unsetVars))
  if (val !== null && typeof val === 'object') {
    return Object.values(val).some((v) => valueReferencesUnset(v, unsetVars))
  }
  return false
}

/**
 * Produce the shell-safe argument representation of a value.
 * Variable references ($var) are emitted as double-quoted "$VAR" so bash expands them.
 * Everything else is single-quoted via shellEscape.
 */
function toShellArg (value: unknown): string {
  const s = toArgValue(value)
  if (s.startsWith('$')) {
    const varName = s.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '_')
    return `"$${varName}"`
  }
  return shellEscape(s)
}

function toJqPath (path: string): string {
  if (path === '' || path === '$body') return '.'

  const parts = path.split('.')
  let jq = ''
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      // Numeric index: always prepend '.' to ensure valid jq (e.g. .[0] not [0])
      jq += `.[${part}]`
    } else {
      jq += `.${part}`
    }
  }
  return jq
}

/**
 * Resolve a YAML expected value to a bash string.
 * Handles variable references ($var) and literal values.
 */
function resolveExpectedValue (value: unknown): string {
  if (typeof value === 'string') {
    if (value.startsWith('$')) {
      const varName = value.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '_')
      return `"$${varName}"`
    }
    return `"${value}"`
  }
  return `"${String(value)}"`
}

function shellEscape (arg: string): string {
  if (typeof arg === 'string' && arg.startsWith('$')) {
    const varName = arg.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '_')
    return `"$${varName}"`
  }
  if (/^[a-zA-Z0-9_./:=-]+$/.test(arg)) return arg
  return `'${escapeSingleQuotes(arg)}'`
}

function escapeSingleQuotes (s: string): string {
  return s.replace(/'/g, "'\\''")
}

function countDoSteps (testFile: TestFile): number {
  let count = 0
  const countIn = (steps: Step[]): void => {
    for (const s of steps) {
      if (s.kind === 'do') count++
    }
  }
  countIn(testFile.setup)
  countIn(testFile.teardown)
  for (const section of testFile.tests) countIn(section.steps)
  return count
}
