/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTestFile, isServerless } from '../parser.ts'

const fixturesDir = join(import.meta.dirname, 'fixtures')

function loadFixture (name: string) {
  const content = readFileSync(join(fixturesDir, name), 'utf-8')
  return parseTestFile(content, name)
}

describe('parseTestFile', () => {
  it('parses requires block', () => {
    const file = loadFixture('get.yml')
    assert.deepStrictEqual(file.requires, { serverless: true, stack: true })
  })

  it('parses setup steps', () => {
    const file = loadFixture('get.yml')
    assert.equal(file.setup.length, 1)
    assert.equal(file.setup[0].kind, 'do')
    const step = file.setup[0] as { kind: 'do', action: string }
    assert.equal(step.action, 'indices.create')
  })

  it('parses teardown steps', () => {
    const file = loadFixture('get.yml')
    assert.equal(file.teardown.length, 1)
    assert.equal(file.teardown[0].kind, 'do')
    const step = file.teardown[0] as { kind: 'do', action: string }
    assert.equal(step.action, 'indices.delete')
  })

  it('parses named test sections', () => {
    const file = loadFixture('get.yml')
    assert.equal(file.tests.length, 1)
    assert.equal(file.tests[0].name, 'get')
  })

  it('parses do steps with body', () => {
    const file = loadFixture('get.yml')
    const doStep = file.tests[0].steps[0]
    assert.equal(doStep.kind, 'do')
    if (doStep.kind === 'do') {
      assert.equal(doStep.action, 'index')
      assert.deepStrictEqual(doStep.params, { index: 'get_test' })
      assert.deepStrictEqual(doStep.body, { name: 'test', service: 'serverless' })
    }
  })

  it('parses set steps', () => {
    const file = loadFixture('get.yml')
    const setStep = file.tests[0].steps[1]
    assert.equal(setStep.kind, 'set')
    if (setStep.kind === 'set') {
      assert.deepStrictEqual(setStep.assignments, { _id: 'id' })
    }
  })

  it('parses match steps', () => {
    const file = loadFixture('get.yml')
    const matchStep = file.tests[0].steps[3]
    assert.equal(matchStep.kind, 'match')
    if (matchStep.kind === 'match') {
      assert.deepStrictEqual(matchStep.assertions, { _id: '$id' })
    }
  })

  it('parses catch in do steps', () => {
    const file = loadFixture('catch.yml')
    const doStep = file.tests[0].steps[0]
    assert.equal(doStep.kind, 'do')
    if (doStep.kind === 'do') {
      assert.equal(doStep.catch, 'resource_not_found_exception')
      assert.equal(doStep.action, 'tasks.get')
    }
  })

  it('parses comparison steps (gte, gt, lte)', () => {
    const file = loadFixture('comparisons.yml')
    const steps = file.tests[0].steps
    const gteStep = steps.find(s => s.kind === 'gte')
    assert.ok(gteStep)
    if (gteStep?.kind === 'gte') {
      assert.deepStrictEqual(gteStep.assertions, { count: 1 })
    }

    const gtStep = steps.find(s => s.kind === 'gt')
    assert.ok(gtStep)
    if (gtStep?.kind === 'gt') {
      assert.deepStrictEqual(gtStep.assertions, { count: 0 })
    }

    const lteStep = steps.find(s => s.kind === 'lte')
    assert.ok(lteStep)
    if (lteStep?.kind === 'lte') {
      assert.deepStrictEqual(lteStep.assertions, { count: 100 })
    }
  })

  it('parses ignore in do steps', () => {
    const file = loadFixture('comparisons.yml')
    const teardownDo = file.teardown[0]
    assert.equal(teardownDo.kind, 'do')
    if (teardownDo.kind === 'do') {
      assert.deepStrictEqual(teardownDo.ignore, [404])
    }
  })
})

describe('isServerless', () => {
  it('returns true for serverless tests', () => {
    const file = loadFixture('get.yml')
    assert.equal(isServerless(file), true)
  })

  it('returns false for stack-only tests', () => {
    const file = loadFixture('stack-only.yml')
    assert.equal(isServerless(file), false)
  })
})
