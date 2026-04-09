/**
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

export interface DoStep {
  kind: 'do'
  /** dot-notation action name (e.g. "indices.create", "get", "bulk") */
  action: string
  /** parameters for the action (everything except "body" and "catch") */
  params: Record<string, unknown>
  /** request body, if present */
  body?: unknown
  /** expected error type — when present the action is expected to fail */
  catch?: string
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
