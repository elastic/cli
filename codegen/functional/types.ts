/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Parsed AST for elasticsearch-clients-tests YAML files
// ---------------------------------------------------------------------------

/** Top-level structure of a parsed YAML test file. */
export interface TestFile {
  /** Source file path (relative to tests dir) */
  sourceFile: string
  requires: Requires
  setup: Step[]
  teardown: Step[]
  tests: TestSection[]
}

export interface Requires {
  serverless: boolean
  stack: boolean
}

/** A named test section (e.g. "get", "Basic bulk operation"). */
export interface TestSection {
  name: string
  steps: Step[]
}

// ---------------------------------------------------------------------------
// Steps — ordered operations within a test section / setup / teardown
// ---------------------------------------------------------------------------

export type Step =
  | DoStep
  | SetStep
  | MatchStep
  | IsTrueStep
  | IsFalseStep
  | LengthStep
  | GtStep
  | GteStep
  | LtStep
  | LteStep
  | ContainsStep
  | SkipStep

export interface DoStep {
  kind: 'do'
  /** dot-notation action name (e.g. "indices.create", "get", "bulk") */
  action: string
  /** parameters for the action (everything except "body", "catch", "headers", "ignore") */
  params: Record<string, unknown>
  /** request body, if present */
  body?: unknown
  /** expected error type — when present the action is expected to fail */
  catch?: string
  /** custom HTTP headers for this request */
  headers?: Record<string, string>
  /** HTTP status codes to ignore (e.g. [404] for teardown cleanup) */
  ignore?: number[]
}

export interface SetStep {
  kind: 'set'
  /** Maps response path -> variable name (e.g. { "_id": "id" }) */
  assignments: Record<string, string>
}

export interface MatchStep {
  kind: 'match'
  /** Maps response path -> expected value */
  assertions: Record<string, unknown>
}

export interface IsTrueStep {
  kind: 'is_true'
  field: string
}

export interface IsFalseStep {
  kind: 'is_false'
  field: string
}

export interface LengthStep {
  kind: 'length'
  /** Maps response path -> expected length */
  assertions: Record<string, number>
}

export interface GtStep {
  kind: 'gt'
  /** Maps response path -> value that response must be greater than */
  assertions: Record<string, number>
}

export interface GteStep {
  kind: 'gte'
  /** Maps response path -> value that response must be greater than or equal to */
  assertions: Record<string, number>
}

export interface LtStep {
  kind: 'lt'
  /** Maps response path -> value that response must be less than */
  assertions: Record<string, number>
}

export interface LteStep {
  kind: 'lte'
  /** Maps response path -> value that response must be less than or equal to */
  assertions: Record<string, number>
}

export interface ContainsStep {
  kind: 'contains'
  /** Maps response path -> value that the array must contain */
  assertions: Record<string, unknown>
}

/** No-op — the skip action is parsed but does not produce output. */
export interface SkipStep {
  kind: 'skip'
}
