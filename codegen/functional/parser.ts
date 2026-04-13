/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseAllDocuments } from 'yaml'
import type {
  TestFile, Requires, TestSection, Step,
  DoStep, SetStep, MatchStep, IsTrueStep, IsFalseStep, LengthStep,
  GtStep, GteStep, LtStep, LteStep, ContainsStep
} from './types.ts'

const RESERVED_KEYS = new Set(['requires', 'setup', 'teardown'])

/**
 * Parse a YAML test file from elasticsearch-clients-tests into a typed AST.
 *
 * Each file is a multi-document YAML stream separated by `---`.
 * Documents are: requires, optional setup, optional teardown, then named test sections.
 */
export function parseTestFile (yamlContent: string, sourceFile: string): TestFile {
  const docs = parseAllDocuments(yamlContent)
  const sections: Record<string, unknown>[] = docs
    .map((doc) => doc.toJSON() as Record<string, unknown> | null)
    .filter((v): v is Record<string, unknown> => v != null)

  let requires: Requires = { serverless: false, stack: false }
  let setup: Step[] = []
  let teardown: Step[] = []
  const tests: TestSection[] = []

  for (const section of sections) {
    if ('requires' in section) {
      const r = section.requires as Record<string, unknown>
      requires = {
        serverless: r.serverless === true,
        stack: r.stack === true
      }
      continue
    }

    if ('setup' in section) {
      setup = parseSteps(section.setup as unknown[])
      continue
    }

    if ('teardown' in section) {
      teardown = parseSteps(section.teardown as unknown[])
      continue
    }

    // remaining keys are named test sections
    for (const [name, steps] of Object.entries(section)) {
      if (RESERVED_KEYS.has(name)) continue
      tests.push({
        name,
        steps: parseSteps(steps as unknown[])
      })
    }
  }

  return { sourceFile, requires, setup, teardown, tests }
}

/**
 * Returns true if the test file targets serverless.
 */
export function isServerless (file: TestFile): boolean {
  return file.requires.serverless
}

// ---------------------------------------------------------------------------
// Step parsing
// ---------------------------------------------------------------------------

function parseSteps (raw: unknown[]): Step[] {
  const steps: Step[] = []
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>

    if ('do' in obj) {
      steps.push(parseDo(obj.do as Record<string, unknown>))
    } else if ('set' in obj) {
      steps.push(parseSet(obj.set as Record<string, unknown>))
    } else if ('match' in obj) {
      steps.push(parseMatch(obj.match as Record<string, unknown>))
    } else if ('is_true' in obj) {
      steps.push(parseIsTrue(obj.is_true))
    } else if ('is_false' in obj) {
      steps.push(parseIsFalse(obj.is_false))
    } else if ('length' in obj) {
      steps.push(parseLength(obj.length as Record<string, unknown>))
    } else if ('gt' in obj) {
      steps.push(parseComparison('gt', obj.gt as Record<string, unknown>))
    } else if ('gte' in obj) {
      steps.push(parseComparison('gte', obj.gte as Record<string, unknown>))
    } else if ('lt' in obj) {
      steps.push(parseComparison('lt', obj.lt as Record<string, unknown>))
    } else if ('lte' in obj) {
      steps.push(parseComparison('lte', obj.lte as Record<string, unknown>))
    } else if ('contains' in obj) {
      steps.push(parseContains(obj.contains as Record<string, unknown>))
    } else if ('skip' in obj) {
      steps.push({ kind: 'skip' })
    }
  }
  return steps
}

/** Keys in a `do` block that are metadata, not the API action. */
const DO_META_KEYS = new Set(['catch', 'headers'])

function parseDo (raw: Record<string, unknown>): DoStep {
  let catchValue: string | undefined
  if ('catch' in raw) {
    catchValue = String(raw.catch)
  }

  const headers = raw.headers as Record<string, string> | undefined

  // The action key is the first key that isn't metadata
  let action = ''
  let actionValue: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (DO_META_KEYS.has(key)) continue
    action = key
    actionValue = (val != null && typeof val === 'object' && !Array.isArray(val))
      ? val as Record<string, unknown>
      : {}
    break
  }

  // Separate body and ignore from other params
  const { body, ignore, ...params } = actionValue

  const step: DoStep = { kind: 'do', action, params }
  if (body !== undefined) step.body = body
  if (catchValue !== undefined) step.catch = catchValue
  if (headers !== undefined) step.headers = headers
  if (ignore !== undefined) {
    const ignoreVal = ignore as number | number[]
    step.ignore = Array.isArray(ignoreVal) ? ignoreVal : [ignoreVal]
  }
  return step
}

function parseSet (raw: Record<string, unknown>): SetStep {
  const assignments: Record<string, string> = {}
  for (const [responsePath, varName] of Object.entries(raw)) {
    assignments[responsePath] = String(varName)
  }
  return { kind: 'set', assignments }
}

function parseMatch (raw: Record<string, unknown>): MatchStep {
  return { kind: 'match', assertions: { ...raw } }
}

function parseIsTrue (raw: unknown): IsTrueStep {
  return { kind: 'is_true', field: String(raw ?? '') }
}

function parseIsFalse (raw: unknown): IsFalseStep {
  return { kind: 'is_false', field: String(raw ?? '') }
}

function parseLength (raw: Record<string, unknown>): LengthStep {
  const assertions: Record<string, number> = {}
  for (const [path, len] of Object.entries(raw)) {
    assertions[path] = Number(len)
  }
  return { kind: 'length', assertions }
}

function parseComparison (kind: 'gt' | 'gte' | 'lt' | 'lte', raw: Record<string, unknown>): GtStep | GteStep | LtStep | LteStep {
  const assertions: Record<string, number> = {}
  for (const [path, val] of Object.entries(raw)) {
    assertions[path] = Number(val)
  }
  return { kind, assertions }
}

function parseContains (raw: Record<string, unknown>): ContainsStep {
  return { kind: 'contains', assertions: { ...raw } }
}
