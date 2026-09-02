/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApiActionDef } from './types.ts'
import {
  YamlFloat,
  type TestFile, type Step, type DoStep, type SetStep, type MatchStep,
  type IsTrueStep, type IsFalseStep, type LengthStep,
  type GtStep, type GteStep, type LtStep, type LteStep, type ContainsStep,
  type WriteNdjsonTempStep, type WriteTempStep
} from './types.ts'
import { buildActionMap, mapAction } from './mapper.ts'
import type { MappedAction } from './mapper.ts'
import type { SchemaArgDefinition } from '../../src/lib/json-schema-args.ts'

export interface GenerateResult {
  /** bash script content */
  script: string
  /** actions that couldn't be mapped (missing from CLI registry) */
  skippedActions: string[]
  /** true if the file was skipped entirely (e.g. all actions unmapped) */
  skipped: boolean
}

/**
 * Thrown when a step's request body contains a key that can't be routed to
 * any CLI flag (schema/mapper gap). Generation aborts rather than silently
 * emitting a script with part of its body missing, which would otherwise
 * only surface as a live-cluster failure (e.g. `parse_exception: request
 * body is required`).
 */
export class UnmappedBodyKeyError extends Error {
  constructor (public readonly action: string, public readonly keys: string[]) {
    super(`action "${action}": unmapped body key(s) [${keys.join(', ')}] — no CLI flag exists to carry this data`)
    this.name = 'UnmappedBodyKeyError'
  }
}

/**
 * Generate a bash test script from a parsed YAML test file.
 */
export interface GenerateOptions {
  /** Leading CLI args identifying the client (default ["stack", "es"]). */
  clientArgs?: string[]
  /** Preamble lines defining the `$ELASTIC` invocation and `$RESPONSE` (default: the `elastic` binary). */
  preamble?: string[]
  /**
   * If a `set` extraction is empty or `null`, try `.[0].id` (bare-array list
   * responses) and skip the script when still empty. Used by Cloud tests
   * against orgs that have no deployments or projects.
   */
  skipEmptySet?: boolean
  /**
   * If a do-step exits non-zero and the JSON error mentions 404 (or a
   * hosted deployment with no version yet), skip the script. Used by Cloud
   * tests for endpoints the org or public QA API does not expose.
   */
  skipNotFound?: boolean
}

const DEFAULT_PREAMBLE = ['exec < /dev/null', 'ELASTIC="elastic --json"', 'RESPONSE=""']

export function generateScript (
  testFile: TestFile,
  definitions: ApiActionDef[],
  opts: GenerateOptions = {}
): GenerateResult {
  const clientArgs = opts.clientArgs ?? ['stack', 'es']
  const preamble = opts.preamble ?? DEFAULT_PREAMBLE
  const skipEmptySet = opts.skipEmptySet === true
  const skipNotFound = opts.skipNotFound === true
  const actionMap = buildActionMap(definitions)
  const skippedActions: string[] = []
  const lines: string[] = []

  lines.push('#!/bin/bash')
  lines.push(`# Generated from ${testFile.sourceFile}`)
  lines.push('set -euo pipefail')
  lines.push('')
  for (const line of preamble) lines.push(line)
  lines.push('')

  const tempFileVars = collectWriteTempVars(testFile)
  if (testFile.teardown.length > 0 || tempFileVars.length > 0) {
    const teardownBody: string[] = []
    if (testFile.teardown.length > 0) {
      renderSteps(testFile.teardown, actionMap, clientArgs, teardownBody, skippedActions, '  ', false, skipEmptySet, skipNotFound)
    }
    for (const v of tempFileVars) {
      teardownBody.push(`  [ -n "$${v}" ] && rm -f -- "$${v}"`)
    }
    if (!hasExecutableLine(teardownBody)) {
      teardownBody.push('  :')
    }
    // The teardown runs via `trap teardown EXIT`, so it fires even when a
    // setup/test `do` fails before the `set` that assigns a stash var. Under
    // `set -u` an unassigned reference would abort teardown with "unbound
    // variable", masking the real failure. Initialize any stash var the
    // teardown references (excluding preamble-defined vars) to empty first.
    // Scoped to teardown only; main-body refs still fail loud as real bugs.
    const preambleVars = new Set(preamble.flatMap(declaredVar))
    for (const v of collectVarRefs(teardownBody)) {
      if (!preambleVars.has(v)) lines.push(`${v}=""`)
    }
    lines.push('teardown() {')
    lines.push(...teardownBody)
    lines.push('}')
    lines.push('trap teardown EXIT')
    lines.push('')
  }

  // hadSkippedDo propagates from setup into test sections so that test-section
  // do-steps depending on state that was never created (skipped setup actions)
  // are run with `|| true` instead of hard-failing the script.
  let hadSkippedDo = false

  if (testFile.setup.length > 0) {
    lines.push('# --- Setup ---')
    hadSkippedDo = renderSteps(testFile.setup, actionMap, clientArgs, lines, skippedActions, '', false, skipEmptySet, skipNotFound)
    lines.push('')
  }

  for (const section of testFile.tests) {
    lines.push(`# --- Test: ${section.name} ---`)
    renderSteps(section.steps, actionMap, clientArgs, lines, skippedActions, '', hadSkippedDo, skipEmptySet, skipNotFound)
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

/** A generated script plus the `requires` metadata used for runtime filtering. */
export interface RunnerScript {
  path: string
  serverless?: boolean
  /** true = runs on stack, false = excluded, null/undefined = not specified */
  stack?: boolean | null
}

/**
 * Generate the run.sh runner script that executes all generated test scripts.
 *
 * Scripts may be passed as bare paths or as {@link RunnerScript} objects. When
 * `requires` metadata is present, the runner reads `ELASTIC_ENVIRONMENT`
 * ("serverless" | "stack") to run only scripts whose matching `requires` field is `true`.
 */
export function generateRunner (scripts: Array<string | RunnerScript>): string {
  const normalized: RunnerScript[] = scripts.map((s) =>
    typeof s === 'string' ? { path: s } : s)
  const lines: string[] = []
  lines.push('#!/bin/bash')
  lines.push('# Runner for generated functional tests')
  lines.push('set -euo pipefail')
  lines.push('')
  lines.push('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"')
  lines.push('PASSED=0')
  lines.push('FAILED=0')
  lines.push('ERRORS=""')
  lines.push('BAIL=0')
  lines.push('for arg in "$@"; do')
  lines.push('  case "$arg" in')
  lines.push('    --bail) BAIL=1 ;;')
  lines.push('  esac')
  lines.push('done')
  lines.push('')
  lines.push('should_run () {')
  lines.push('  # args: <serverless> <stack>')
  lines.push('  [ -z "${ELASTIC_ENVIRONMENT:-}" ] && return 0')
  lines.push('  [ "${ELASTIC_ENVIRONMENT}" = serverless ] && [ "$1" = true ] && return 0')
  lines.push('  [ "${ELASTIC_ENVIRONMENT}" = stack ] && [ "$2" = true ] && return 0')
  lines.push('  return 1')
  lines.push('}')
  lines.push('')

  for (const { path: p, serverless, stack } of normalized) {
    lines.push(`if should_run ${serverless === true ? 'true' : 'false'} ${stack === true ? 'true' : 'false'}; then`)
    lines.push(`  if OUTPUT=$(bash "$SCRIPT_DIR/${p}" 2>&1); then`)
    lines.push('    PASSED=$((PASSED + 1))')
    lines.push(`    echo "PASS: ${p}"`)
    lines.push('  else')
    lines.push('    FAILED=$((FAILED + 1))')
    lines.push(`    ERRORS="$ERRORS\\n  FAIL: ${p}"`)
    lines.push(`    echo "FAIL: ${p}"`)
    lines.push('    echo "$OUTPUT" | tail -5')
    lines.push('    if [ "$BAIL" -eq 1 ]; then exit 1; fi')
    lines.push('  fi')
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

/**
 * Extract the variable name declared by a preamble line (e.g. `RESPONSE=""`
 * -> `RESPONSE`), or nothing if the line is not an assignment.
 */
function declaredVar (line: string): string[] {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=/)
  return m?.[1] != null ? [m[1]] : []
}

/**
 * Collect distinct bash variable names referenced (`$VAR` / `${VAR}`) across
 * the given lines, in first-seen order. Assignment targets like `VAR=$(...)`
 * are not matched (the `$` there belongs to `$(`).
 */
function collectVarRefs (lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    for (const m of line.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) {
      const v = m[1]
      if (v != null && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
  }
  return out
}

/**
 * Renders a sequence of test steps into bash lines.
 * @param initialHadSkippedDo - if true, assume prior steps in an earlier
 *   section (e.g. setup) already skipped do-steps, so the first mapped
 *   do-step in this section gets `|| true`.
 * @returns whether any do-step was skipped in this section (for chaining
 *   into subsequent sections).
 */
function renderSteps (
  steps: Step[],
  actionMap: Map<string, ApiActionDef>,
  clientArgs: string[],
  lines: string[],
  skippedActions: string[],
  indent: string,
  initialHadSkippedDo = false,
  skipEmptySet = false,
  skipNotFound = false
): boolean {
  // Assertions and set-steps read $RESPONSE, which is written by the most
  // recent successful `do`. If the last `do` was skipped (unmapped action,
  // unsupported catch, etc.) $RESPONSE is stale or empty, so any assertion
  // that follows would assert against the wrong data — skip those too
  // until the next executed `do` resets the response.
  let responseFromLastDo = false
  const unsetVars = new Set<string>()
  let hadSkippedDo = initialHadSkippedDo

  for (const step of steps) {
    if (step.kind === 'do') {
      // Check if any param/body value (recursively) references an unset variable
      const referencesUnset = valueReferencesUnset(step.params, unsetVars) ||
        (step.body != null && valueReferencesUnset(step.body, unsetVars))
      if (referencesUnset) {
        lines.push(`${indent}# SKIPPED: step references undefined variable from skipped set`)
        responseFromLastDo = false
        hadSkippedDo = true
        continue
      }
      // Only pass allowFailure from the setup→test propagation, not from
      // prior skipped steps within the same section (those are unrelated).
      const result = renderDo(step, actionMap, clientArgs, lines, skippedActions, indent, initialHadSkippedDo, skipNotFound)
      if (result === 'skipped') {
        responseFromLastDo = false
        hadSkippedDo = true
      } else if (result === 'optional') {
        // Mapped but ran with || true due to missing setup state.
        // $RESPONSE may be stale — skip assertions.
        responseFromLastDo = false
      } else {
        responseFromLastDo = true
      }
      continue
    }
    if (step.kind === 'skip') continue
    if (step.kind === 'write_temp') {
      renderWriteTemp(step, lines, indent)
      continue
    }

    if (!responseFromLastDo) {
      if (step.kind === 'set') {
        // Track variables that won't be set
        for (const varName of Object.values(step.assignments)) {
          unsetVars.add(varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
        }
      }
      if (step.kind === 'write_ndjson_temp') {
        unsetVars.add(step.varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
      }
      lines.push(`${indent}# SKIPPED: ${step.kind} assertion follows skipped do-step`)
      continue
    }

    switch (step.kind) {
      case 'set':
        renderSet(step, lines, indent, skipEmptySet)
        // If a variable was previously unset, it's now set
        for (const varName of Object.values(step.assignments)) {
          unsetVars.delete(varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
        }
        break
      case 'write_ndjson_temp':
        renderWriteNdjsonTemp(step, lines, indent)
        unsetVars.delete(step.varName.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
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
  return hadSkippedDo
}

/**
 * Render a do-step.
 * Returns:
 *   'executed' — command was emitted and $RESPONSE is reliable
 *   'optional' — command was emitted with || true ($RESPONSE may be stale)
 *   'skipped'  — command was not emitted (unmapped action, unsupported catch)
 */
function renderDo (
  step: DoStep,
  actionMap: Map<string, ApiActionDef>,
  clientArgs: string[],
  lines: string[],
  skippedActions: string[],
  indent: string,
  allowFailure = false,
  skipNotFound = false
): 'executed' | 'optional' | 'skipped' {
  if (step.catch != null) {
    lines.push(`${indent}# SKIPPED: catch not supported in MVP (catch: ${step.catch})`)
    return 'skipped'
  }

  if (step.headers != null) {
    lines.push(`${indent}# NOTE: headers not supported by CLI (${Object.keys(step.headers).join(', ')})`)
  }

  const mapped = mapAction(step.action, step.params, actionMap, clientArgs)
  if (mapped == null) {
    skippedActions.push(step.action)
    lines.push(`${indent}# SKIPPED: action "${step.action}" not registered in CLI`)
    return 'skipped'
  }

  const cmd = buildCommand(mapped, step)

  const optional = allowFailure || (step.ignore != null && step.ignore.length > 0)
  if (optional) {
    lines.push(`${indent}RESPONSE=$(${cmd}) || true`)
    return 'optional'
  }
  if (skipNotFound) {
    // Handler errors go to stderr (`writeErr`); keep them out of $RESPONSE.
    const errFile = '"${TMPDIR:-/tmp}/elastic-cli-do-err.$$"'
    lines.push(`${indent}set +e`)
    lines.push(`${indent}RESPONSE=$(${cmd} 2>${errFile})`)
    lines.push(`${indent}_ec=$?`)
    lines.push(`${indent}set -e`)
    lines.push(`${indent}if [ "$_ec" -ne 0 ]; then`)
    lines.push(`${indent}  if jq -e '(.error.message | tostring | test("404|Could not determine the version"))' ${errFile} >/dev/null 2>&1; then`)
    lines.push(`${indent}    echo "SKIP: ${step.action} not available"`)
    lines.push(`${indent}    exit 0`)
    lines.push(`${indent}  fi`)
    lines.push(`${indent}  cat ${errFile} >&2`)
    lines.push(`${indent}  exit $_ec`)
    lines.push(`${indent}fi`)
    return 'executed'
  }
  lines.push(`${indent}RESPONSE=$(${cmd})`)
  return 'executed'
}

/**
 * Builds the CLI command for a do-step.
 *
 * Any body key that can't be routed to a CLI flag — because the CLI's
 * schema-derived arg map has no matching entry, or because a whole-body
 * (single-value) endpoint has no CLI flag to receive it at all — is a
 * codegen gap that would otherwise silently produce a command missing part
 * of its request body. Rather than emitting a broken script that fails only
 * once run against a live cluster, this throws so the gap is caught at
 * generation time.
 */
function buildCommand (mapped: MappedAction, step: DoStep): string {
  const args = mapped.cliArgs.map(shellEscape).join(' ')
  let base = `$ELASTIC ${args}`

  // Pass body fields as individual CLI flags.
  if (step.body != null) {
    const extraArgs: string[] = []
    let body = step.body
    // Preserve the original string for block scalar bodies so we can pass it
    // through without JSON round-tripping (which loses float notation like 0.0).
    const originalBodyStr = typeof body === 'string' ? body.trim() : null

    // YAML `body: >` block scalars produce a string containing JSON.
    // Parse it into an object so keys can be matched to CLI flags.
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        // Not valid JSON — pass as-is to the first body arg
      }
    }

    if (Array.isArray(body)) {
      // Array bodies (e.g. bulk operations) — the whole array maps to the
      // single body arg (e.g. --operations).
      const arrayArgDef = [...mapped.bodyArgsByKey.values()].find(
        (a) => a.foundIn === 'body'
      )
      if (arrayArgDef == null) {
        throw new UnmappedBodyKeyError(step.action, ['(array body)'])
      }
        // Some YAML bulk tests use a compact format where the document is embedded
        // as a `data` field inside the action metadata object:
        //   { index: { _index: ..., _id: ..., data: { field: value } } }
        // Expand these into proper alternating action+document NDJSON pairs.
        const expanded = expandBulkDataFields(body as unknown[])
        extraArgs.push(`--${arrayArgDef.cliFlag}`, toShellArg(expanded))
    } else if (typeof body === 'object' && body !== null) {
      // Object bodies — try matching each top-level key to a body schema arg.
      const bodyObj = body as Record<string, unknown>
      const bodyMatched: string[] = []
      // Track params already set via step.params to avoid duplicates
      const alreadySetParams = new Set(Object.keys(step.params))
      const bodyKeys = Object.keys(bodyObj)
      const unmappedKeys: string[] = []
      for (const [key, value] of Object.entries(bodyObj)) {
        const argDef = mapped.bodyArgsByKey.get(key)
        if (argDef != null && (argDef.foundIn === 'body' || argDef.foundIn === undefined)) {
          // Guard against name collisions between YAML sub-fields and CLI body args.
          // If the CLI arg expects an object/array but the YAML value is a primitive,
          // only match when this is the sole body key (the primitive IS the value).
          // With multiple keys the body is a wrapper object whose sub-fields happen
          // to share a name with the arg (e.g. logstash pipeline).
          if (argDef.type === 'object' && typeof value !== 'object' && bodyKeys.length > 1) continue
          if (argDef.type === 'array' && !Array.isArray(value) && bodyKeys.length > 1) continue
          bodyMatched.push(key)
          extraArgs.push(`--${argDef.cliFlag}`, coerceBodyArg(value, argDef))
        } else if (argDef != null && (argDef.foundIn === 'path' || argDef.foundIn === 'query') && !alreadySetParams.has(key)) {
          // Body keys that match path/query params not already set
          // (e.g. render_search_template's "id" is a path param but YAML tests put it in the body)
          extraArgs.push(`--${argDef.cliFlag}`, toShellArg(value))
        } else if (argDef == null) {
          unmappedKeys.push(key)
        }
      }
      // If no top-level keys matched body fields, the entire body is a freeform
      // document (e.g. `index` where the body IS the document). Pass it to the
      // single body arg (e.g. --document).
      // Prefer the original string to avoid JSON round-trip float loss (0.0 → 0).
      if (bodyMatched.length > 0 && unmappedKeys.length > 0) {
        // Some body keys matched schema args and others didn't — this isn't
        // the "whole body is a freeform document" case (that requires zero
        // matches, meaning the object itself is the document/value). Here
        // the body is a wrapper object with named fields and at least one
        // of them has nowhere to go — a real codegen/schema gap.
        throw new UnmappedBodyKeyError(step.action, unmappedKeys)
      }
      if (bodyMatched.length === 0) {
        const singleBodyArg = [...mapped.bodyArgsByKey.values()].find(
          (a) => a.foundIn === 'body'
        )
        if (singleBodyArg == null) {
          throw new UnmappedBodyKeyError(step.action, bodyKeys)
        }
        if (originalBodyStr != null) {
          extraArgs.push(`--${singleBodyArg.cliFlag}`, shellEscape(originalBodyStr))
        } else if (containsVarRef(body)) {
          // Whole-body arg carrying $var references (e.g. patch_rule's body.id
          // set from a create step) — expand vars instead of quoting literally.
          extraArgs.push(`--${singleBodyArg.cliFlag}`, buildVarExpandingJson(body))
        } else {
          extraArgs.push(`--${singleBodyArg.cliFlag}`, toShellArg(body))
        }
      }
    } else if (typeof body === 'string') {
      // Unparseable string body — pass raw to the first body arg
      const singleBodyArg = [...mapped.bodyArgsByKey.values()].find(
        (a) => a.foundIn === 'body'
      )
      if (singleBodyArg == null) {
        throw new UnmappedBodyKeyError(step.action, ['(string body)'])
      }
      extraArgs.push(`--${singleBodyArg.cliFlag}`, toShellArg(body))
    }

    if (extraArgs.length > 0) {
      base = `${base} ${extraArgs.join(' ')}`
    }
  }

  return base
}

function renderSet (step: SetStep, lines: string[], indent: string, skipEmptySet = false): void {
  for (const [responsePath, varName] of Object.entries(step.assignments)) {
    const bashVar = varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const jqPath = toJqPath(responsePath)
    if (skipEmptySet) {
      // `try` so a nested path like `.regions[0].id` against a bare array
      // yields empty instead of aborting the script (jq cannot index an
      // array with a string).
      lines.push(`${indent}${bashVar}=$(echo "$RESPONSE" | jq -r 'try (${jqPath} // empty) catch empty')`)
      lines.push(`${indent}if [ -z "$${bashVar}" ] || [ "$${bashVar}" = "null" ]; then`)
      // Serverless lists wrap items in `.items`; regions return a bare array.
      lines.push(`${indent}  ${bashVar}=$(echo "$RESPONSE" | jq -r 'if type=="array" then .[0].id // empty else .items[0].id // empty end')`)
      lines.push(`${indent}fi`)
      lines.push(`${indent}if [ -z "$${bashVar}" ] || [ "$${bashVar}" = "null" ]; then`)
      lines.push(`${indent}  echo "SKIP: no ${varName} in list response"`)
      lines.push(`${indent}  exit 0`)
      lines.push(`${indent}fi`)
    } else {
      lines.push(`${indent}${bashVar}=$(echo "$RESPONSE" | jq -r '${jqPath}')`)
    }
  }
}

function renderWriteNdjsonTemp (step: WriteNdjsonTempStep, lines: string[], indent: string): void {
  const bashVar = step.varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  // The Kibana client decodes an NDJSON export response into a JSON array; jq
  // reconstitutes one NDJSON line per element so the import step can pass the
  // temp file via --file. Kibana rejects any file extension other than
  // .ndjson, and mktemp yields a random suffix, so place the file in a temp
  // dir with an explicit .ndjson name.
  lines.push(`${indent}${bashVar}=$(mktemp -d)/export.ndjson`)
  lines.push(`${indent}echo "$RESPONSE" | jq -c '.[]' > "$${bashVar}"`)
}

function renderWriteTemp (step: WriteTempStep, lines: string[], indent: string): void {
  const bashVar = step.varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  const suffix = step.suffix ?? ''
  lines.push(`${indent}${bashVar}=$(mktemp -d)/fixture${suffix}`)
  lines.push(`${indent}cat > "$${bashVar}" <<'CLI_FT_WRITE_TEMP_EOF'`)
  for (const line of step.content.replace(/\n$/, '').split('\n')) lines.push(line)
  lines.push('CLI_FT_WRITE_TEMP_EOF')
}

function collectWriteTempVars (file: TestFile): string[] {
  const steps = [...file.setup, ...file.teardown, ...file.tests.flatMap((t) => t.steps)]
  const seen = new Set<string>()
  const out: string[] = []
  for (const step of steps) {
    if (step.kind !== 'write_temp' || step.varName === '') continue
    const v = step.varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
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

  // Safe label for error messages: escape all shell metacharacters to prevent injection
  const safeLabel = path.replace(/[\\$`"'!#&|;(){}[\]<>?*~]/g, '\\$&')

  // Detect YAML regex pattern /.../ — use bash =~ operator
  if (typeof expected === 'string' && expected.startsWith('/') && expected.endsWith('/')) {
    const pattern = expected.slice(1, -1)
    const jqPath = toJqPath(path)
    if (path === '$body' || path === '') {
      lines.push(`${indent}# SKIPPED: regex match on response body (text-format assertion)`)
      return
    }
    lines.push(`${indent}[[ "$(echo "$RESPONSE" | jq -r '${jqPath}')" =~ ${pattern} ]] || { echo 'FAIL: expected ${safeLabel} to match /${pattern}/'; exit 1; }`)
    return
  }

  const jqPath = toJqPath(path)

  if (Array.isArray(expected)) {
    const expectedJson = jsonStringify(expected)
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq -Sc '${jqPath}')" = '${escapeSingleQuotes(expectedJson)}' ] || { echo "FAIL: expected ${safeLabel} = ${escapeSingleQuotes(expectedJson)}"; exit 1; }`)
    return
  }

  if (expected === null) {
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "null" ] || { echo "FAIL: expected ${safeLabel} = null"; exit 1; }`)
    return
  }

  const expectedStr = resolveExpectedValue(expected)

  if (expected instanceof YamlFloat) {
    // YamlFloat wraps integer-valued YAML floats (e.g. 100.0) — exact match
    lines.push(`${indent}[ "$(echo "$RESPONSE" | jq '${jqPath}')" = "${expected.value}" ] || { echo "FAIL: expected ${safeLabel} = ${expected.value}"; exit 1; }`)
  } else if (typeof expected === 'number' && !Number.isInteger(expected)) {
    // Non-integer float: use approximate comparison to avoid IEEE 754 precision issues
    lines.push(`${indent}echo "$RESPONSE" | jq -e '(((${jqPath}) - ${expected}) | fabs) < 1e-6' > /dev/null || { echo "FAIL: expected ${safeLabel} ≈ ${expected}"; exit 1; }`)
  } else if (typeof expected === 'number') {
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
    lines.push(`${indent}{ [ -z "$RESPONSE" ] || [ "$RESPONSE" = "false" ] || [ "$RESPONSE" = "null" ]; } || { echo "FAIL: expected empty/false response"; exit 1; }`)
  } else {
    const jqPath = toJqPath(step.field)
    // Accept null, false, "false", "0", or "" — ES returns string "false" for some settings
    lines.push(`${indent}echo "$RESPONSE" | jq -e '(${jqPath}) == null or (${jqPath}) == false or (${jqPath}) == "false" or (${jqPath}) == "0" or (${jqPath}) == ""' > /dev/null || { echo "FAIL: expected ${step.field} to be falsy"; exit 1; }`)
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
    const expectedJson = jsonStringify(expected)
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
/**
 * Coerce a YAML body value to a shell-safe CLI flag argument, accounting for
 * type mismatches between YAML data and CLI schema arg types.
 * - Arrays targeting string-typed flags are comma-joined (e.g. index_patterns).
 * - Objects containing $var references use double-quoted JSON with embedded
 *   variable expansion.
 */
function coerceBodyArg (value: unknown, argDef: SchemaArgDefinition): string {
  // Array value → string-typed flag: join with commas (e.g. index_patterns)
  if (Array.isArray(value) && argDef.type === 'string') {
    return shellEscape(value.map(String).join(','))
  }
  // Object/array containing $var references needs special quoting
  if (value !== null && typeof value === 'object' && containsVarRef(value)) {
    return buildVarExpandingJson(value)
  }
  return toShellArg(value)
}

function toArgValue (value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof YamlFloat) return `${value.value}.0`
  return jsonStringify(value)
}

/**
 * Like JSON.stringify but emits integer-valued YamlFloat instances with
 * a trailing `.0` so Painless (and similar) correctly treats them as floats.
 */
function jsonStringify (value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (value instanceof YamlFloat) {
    return value.value % 1 === 0 ? `${value.value}.0` : String(value.value)
  }
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(jsonStringify).join(',') + ']'
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}:${jsonStringify(v)}`)
    return '{' + entries.join(',') + '}'
  }
  return JSON.stringify(value)
}

/**
 * Expands bulk body items that use the compact YAML test format where the document
 * is nested as `data` inside the action metadata:
 *   { index: { _index: "x", _id: "1", data: { name: "foo" } } }
 * becomes two items (action + document) as required by the ES bulk NDJSON format:
 *   { index: { _index: "x", _id: "1" } }
 *   { name: "foo" }
 */
function expandBulkDataFields (items: unknown[]): unknown[] {
  const result: unknown[] = []
  for (const item of items) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>
      const actionKey = ['index', 'create', 'update', 'delete'].find((k) => k in obj)
      if (actionKey != null) {
        const actionMeta = obj[actionKey] as Record<string, unknown>
        if ('data' in actionMeta) {
          const { data, ...rest } = actionMeta
          result.push({ [actionKey]: rest })
          result.push(data)
          continue
        }
      }
    }
    result.push(item)
  }
  return result
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
    if (part === '') continue
    if (/^\d+$/.test(part)) {
      // Append [N] directly — avoid `.[N]` after a field name which older jq rejects.
      if (jq === '') {
        jq += `.[${part}]`
      } else {
        jq += `[${part}]`
      }
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      jq += `.${part}`
    } else {
      // Quote field names containing special chars (hyphens, dots, etc.)
      // Avoid `.["..."]` after a prior component — older jq rejects the dot before `[`.
      if (jq === '') {
        jq += `.["${part}"]`
      } else {
        jq += `["${part}"]`
      }
    }
  }
  return jq || '.'
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

/**
 * Checks if a value (recursively) contains any bash variable reference ($var).
 */
function containsVarRef (val: unknown): boolean {
  if (typeof val === 'string') return val.startsWith('$')
  if (Array.isArray(val)) return val.some(containsVarRef)
  if (val !== null && typeof val === 'object') {
    return Object.values(val as Record<string, unknown>).some(containsVarRef)
  }
  return false
}

/**
 * Build a shell argument for JSON containing bash variable references.
 * Uses concatenation of single- and double-quoted segments so variables expand.
 * E.g. {"id":"$id","keep_alive":"1m"} → '{"id":"'"$ID"'","keep_alive":"1m"}'
 */
function buildVarExpandingJson (value: unknown): string {
  const json = jsonStringify(value)
  // First escape any literal single quotes in the JSON
  const escaped = escapeSingleQuotes(json)
  // Then replace "$varname" patterns with shell variable break-outs
  const expanded = escaped.replace(/"\$([a-zA-Z_][a-zA-Z0-9_]*)"/g, (_match, varName: string) => {
    const bashVar = varName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    return `"'"$${bashVar}"'"`
  })
  return `'${expanded}'`
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
