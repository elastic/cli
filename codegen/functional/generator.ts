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
  lines.push('ELASTIC="elastic --format=json"')
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
  for (const step of steps) {
    switch (step.kind) {
      case 'do':
        renderDo(step, actionMap, lines, skippedActions, indent)
        break
      case 'set':
        renderSet(step, lines, indent)
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
      case 'skip':
        break
    }
  }
}

function renderDo (
  step: DoStep,
  actionMap: Map<string, EsApiDefinition>,
  lines: string[],
  skippedActions: string[],
  indent: string
): void {
  if (step.catch != null) {
    lines.push(`${indent}# SKIPPED: catch not supported in MVP (catch: ${step.catch})`)
    return
  }

  if (step.headers != null) {
    lines.push(`${indent}# NOTE: headers not supported by CLI (${Object.keys(step.headers).join(', ')})`)
  }

  const mapped = mapAction(step.action, step.params, actionMap)
  if (mapped == null) {
    skippedActions.push(step.action)
    lines.push(`${indent}# SKIPPED: action "${step.action}" not registered in CLI`)
    return
  }

  const cmd = buildCommand(mapped, step)

  if (step.ignore != null && step.ignore.length > 0) {
    lines.push(`${indent}RESPONSE=$(${cmd}) || true`)
  } else {
    lines.push(`${indent}RESPONSE=$(${cmd})`)
  }
}

function buildCommand (mapped: MappedAction, step: DoStep): string {
  const args = mapped.cliArgs.map(shellEscape).join(' ')
  const base = `$ELASTIC ${args}`

  if (step.body != null) {
    const json = JSON.stringify(step.body)
    return `echo '${escapeSingleQuotes(json)}' | ${base} --file -`
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
    const jqPath = toJqPath(path)
    const expectedStr = resolveExpectedValue(expected)

    if (typeof expected === 'number') {
      lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "${expected}" ] || { echo "FAIL: expected ${path} = ${expected}"; exit 1; }`)
    } else if (typeof expected === 'boolean') {
      lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "${String(expected)}" ] || { echo "FAIL: expected ${path} = ${String(expected)}"; exit 1; }`)
    } else {
      lines.push(`${indent}[ "$(echo "$RESPONSE" | jq -r '${jqPath}')" = ${expectedStr} ] || { echo "FAIL: expected ${path} = ${expectedStr}"; exit 1; }`)
    }
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
    lines.push(`${indent}[ -z "$RESPONSE" ] || { echo "FAIL: expected empty response"; exit 1; }`)
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
function toJqPath (path: string): string {
  if (path === '' || path === '$body') return '.'

  const parts = path.split('.')
  let jq = ''
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      jq += `[${part}]`
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
