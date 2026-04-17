/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTestFile } from '../parser.ts'
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
    input: z.object({
      index: z.string().meta({ found_in: 'path' })
    })
  },
  {
    name: 'delete',
    namespace: 'indices',
    description: 'Delete an index',
    method: 'DELETE',
    path: '/{index}',
    input: z.object({
      index: z.string().meta({ found_in: 'path' })
    })
  },
  {
    name: 'get',
    description: 'Get a document',
    method: 'GET',
    path: '/{index}/_doc/{id}',
    input: z.object({
      id: z.string().meta({ found_in: 'path' }),
      index: z.string().meta({ found_in: 'path' })
    })
  },
  {
    name: 'index',
    description: 'Index a document',
    method: 'POST',
    path: '/{index}/_doc',
    input: z.object({
      index: z.string().meta({ found_in: 'path' })
    })
  },
  {
    name: 'count',
    description: 'Count documents',
    method: 'GET',
    path: '/{index}/_count',
    input: z.object({
      index: z.string().meta({ found_in: 'path' })
    })
  },
  {
    name: 'bulk',
    description: 'Bulk operations',
    method: 'POST',
    path: '/_bulk',
    input: z.object({
      refresh: z.boolean().optional().meta({ found_in: 'query' })
    })
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

  it('generates setup steps', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes('# --- Setup ---'))
    assert.ok(result.script.includes('$ELASTIC es indices create'))
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

  it('generates body via stdin pipe', () => {
    const content = readFileSync(join(fixturesDir, 'get.yml'), 'utf-8')
    const testFile = parseTestFile(content, 'get.yml')
    const result = generateScript(testFile, testDefs)
    assert.ok(result.script.includes("echo '"))
    assert.ok(result.script.includes('--file -'))
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
