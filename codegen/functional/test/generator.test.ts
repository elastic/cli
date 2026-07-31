/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTestFile } from '../parser.ts'
import type { TestFile } from '../types.ts'
import { generateScript, generateRunner } from '../generator.ts'
import type { EsApiDefinition } from '../../../src/es/types.ts'

const fixturesDir = join(import.meta.dirname, 'fixtures')

const testDefs: EsApiDefinition[] = [
  {
    name: 'create',
    namespace: 'indices',
    description: 'Create an index',
    method: 'PUT',
    path: '/{index}',
    input: { type: 'object', properties: { index: { type: 'string', 'x-found-in': 'path' } }, required: ['index'] }
  },
  {
    name: 'delete',
    namespace: 'indices',
    description: 'Delete an index',
    method: 'DELETE',
    path: '/{index}',
    input: { type: 'object', properties: { index: { type: 'string', 'x-found-in': 'path' } }, required: ['index'] }
  },
  {
    name: 'get',
    description: 'Get a document',
    method: 'GET',
    path: '/{index}/_doc/{id}',
    input: { type: 'object', properties: { id: { type: 'string', 'x-found-in': 'path' }, index: { type: 'string', 'x-found-in': 'path' } }, required: ['id', 'index'] }
  },
  {
    name: 'index',
    description: 'Index a document',
    method: 'POST',
    path: '/{index}/_doc',
    input: { type: 'object', properties: { index: { type: 'string', 'x-found-in': 'path' }, document: { type: 'object', 'x-found-in': 'body' } }, required: ['index'] }
  },
  {
    name: 'count',
    description: 'Count documents',
    method: 'GET',
    path: '/{index}/_count',
    input: { type: 'object', properties: { index: { type: 'string', 'x-found-in': 'path' } }, required: ['index'] }
  },
  {
    name: 'bulk',
    description: 'Bulk operations',
    method: 'POST',
    path: '/_bulk',
    input: { type: 'object', properties: { refresh: { type: 'boolean', 'x-found-in': 'query' }, operations: { type: 'array', 'x-found-in': 'body' } } }
  }
]

describe('generateScript', () => {
  it('generates valid bash with shebang and set -euo', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.startsWith('#!/bin/bash\n'))
    assert.ok(result.script.includes('set -euo pipefail'))
  })

  it('invokes elastic with the supported --json flag', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(
      result.script.includes('ELASTIC="elastic --json"'),
      'generator must emit --json (--format=json is not a CLI option)'
    )
    assert.ok(
      !result.script.includes('--format=json'),
      'unsupported --format=json flag must not appear in generated scripts'
    )
  })

  it('generates setup steps', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('# --- Setup ---'))
    assert.ok(result.script.includes('$ELASTIC stack es indices create'))
  })

  it('generates teardown with trap', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('teardown()'))
    assert.ok(result.script.includes('trap teardown EXIT'))
  })

  it('generates set steps with jq extraction', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes("jq -r '._id'"))
    assert.ok(result.script.includes('ID='))
  })

  it('generates match assertions', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('"$ID"'))
    assert.ok(result.script.includes('FAIL:'))
  })

  it('generates do-steps for actions with body', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(
      result.script.includes('$ELASTIC stack es index --index get_test --document'),
      'should emit the index command with the body routed to the document flag'
    )
  })

  it('skips catch steps with comment', () => {
    const content = readFileSync(join(fixturesDir, 'catch.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'catch.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('# SKIPPED: catch not supported'))
  })

  it('generates comparison assertions', () => {
    const content = readFileSync(join(fixturesDir, 'comparisons.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'comparisons.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('-ge'))
    assert.ok(result.script.includes('-gt'))
    assert.ok(result.script.includes('-le'))
  })

  it('handles ignore with || true in teardown', () => {
    const content = readFileSync(join(fixturesDir, 'comparisons.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'comparisons.yml')
    const result = generateScript(testFile, testDefs)
    const teardownSection = result.script.split('trap teardown EXIT')[0]
    assert.ok(teardownSection.includes('|| true'), 'teardown should use || true for ignored errors')
  })

  it('emits a no-op in teardown when every step is skipped', () => {
    const content = readFileSync(join(fixturesDir, 'skipped-teardown.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'skipped-teardown.yml')
    const result = generateScript(testFile, testDefs)
    const teardownSection = result.script.split('trap teardown EXIT')[0]
    const body = teardownSection
      .split('teardown() {')[1]
      .split('}')[0]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    assert.ok(
      body.some((l) => l === ':'),
      'teardown body with only skipped steps must contain a ":" no-op'
    )
  })

  it('produces teardown that parses as valid bash when all steps are skipped', async () => {
    const { spawnSync } = await import('node:child_process')
    const content = readFileSync(join(fixturesDir, 'skipped-teardown.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'skipped-teardown.yml')
    const result = generateScript(testFile, testDefs)
    const parsed = spawnSync('bash', ['-n'], { input: result.script })
    assert.equal(parsed.status, 0, `bash -n failed: ${parsed.stderr.toString()}`)
  })

  it('skips assertions that follow an unmapped do-step', () => {
    const content = readFileSync(join(fixturesDir, 'skipped-do-then-assert.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'skipped-do-then-assert.yml')
    const result = generateScript(testFile, testDefs)

    const matches = result.script.match(/assertion follows skipped do-step/g) ?? []
    assert.ok(
      matches.length >= 3,
      `expected at least 3 skip-comments for match/is_true/set after unmapped do, got ${matches.length}`
    )

    // Assertions that follow a mapped do (indices.create) should still render.
    assert.ok(
      result.script.includes('FAIL: expected acknowledged = true'),
      'assertion after a mapped do should still emit'
    )
  })

  it('still emits assertions after a successful do resets the response', () => {
    const content = readFileSync(join(fixturesDir, 'skipped-do-then-assert.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'skipped-do-then-assert.yml')
    const result = generateScript(testFile, testDefs)

    // Exactly one `match` should render as an actual assertion line — the
    // one after indices.create. The earlier `match` after the unmapped do
    // must not produce an executable comparison.
    const emittedAssertions = result.script
      .split('\n')
      .filter((l) => l.includes('FAIL: expected acknowledged'))
    assert.equal(emittedAssertions.length, 1)
  })

  it('prints PASS on success', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('echo "PASS: get.yml"'))
  })

  it('tracks skipped actions for unregistered APIs', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, [])
    assert.ok(result.skippedActions.length > 0)
    assert.ok(result.skippedActions.includes('indices.create'))
  })

  it('throws UnmappedBodyKeyError when a body key has no matching CLI flag', () => {
    // 'document' routes to index's body-typed arg; 'legacy_alias_field' has
    // no schema-derived match — a partial mapping, matching the real-world
    // gap where ES accepts a deprecated field alias the current schema
    // doesn't declare.
    const testFile: TestFile = {
      sourceFile: 'unmapped-body.yml',
      requires: { serverless: true, stack: true },
      setup: [],
      teardown: [],
      tests: [{
        name: 'unmapped body key',
        steps: [
          {
            kind: 'do',
            action: 'index',
            params: { index: 'x' },
            body: { document: { name: 'test' }, legacy_alias_field: ['a'] }
          }
        ]
      }]
    }
    assert.throws(
      () => generateScript(testFile, testDefs),
      /unmapped body key\(s\) \[legacy_alias_field\]/
    )
  })
})

describe('generateRunner', () => {
  it('generates a runner with pass/fail counting', () => {
    const runner = generateRunner(['get.sh', 'bulk/10_basic.sh'])
    assert.ok(runner.includes('#!/bin/bash'))
    assert.ok(runner.includes('PASSED='))
    assert.ok(runner.includes('FAILED='))
    assert.ok(runner.includes('get.sh'))
    assert.ok(runner.includes('bulk/10_basic.sh'))
  })

  it('exits 1 on failures', () => {
    const runner = generateRunner(['test.sh'])
    assert.ok(runner.includes('exit 1'))
  })
})

describe('shell injection prevention in match assertions', () => {
  it('escapes shell metacharacters in assertion path labels', () => {
    const testFile = {
      sourceFile: 'injection.yml',
      requires: { serverless: true, stack: true },
      setup: [],
      teardown: [],
      tests: [{
        name: 'injection test',
        steps: [
          { kind: 'do' as const, action: 'get', params: { index: 'x', id: '1' }, body: undefined },
          { kind: 'match' as const, assertions: { '$(whoami)': 'safe' } },
          { kind: 'match' as const, assertions: { '`rm -rf /`': 'safe' } },
          { kind: 'match' as const, assertions: { 'field"$(id)': 'safe' } },
        ]
      }]
    }
    const result = generateScript(testFile, testDefs)
    assert.ok(
      result.script.includes('expected \\$\\(whoami\\)'),
      'should contain escaped \\$\\(whoami\\) in FAIL message label'
    )

    assert.ok(
      result.script.includes('expected \\`rm'),
      'should contain escaped backtick in FAIL message label'
    )

    assert.ok(
      result.script.includes('expected field\\"\\$\\(id\\)'),
      'should contain escaped double quote and $ in FAIL message label'
    )
  })
})
