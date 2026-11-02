/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTestFile, isServerless, shouldSkipServerlessProject, shouldSkipStackVersion, stackSinceFor } from '../parser.ts'

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

  it('parses serverless_project as a string', () => {
    const file = parseTestFile(
      '---\nrequires:\n  serverless: true\n  stack: true\n  serverless_project: security\n---\n"t":\n  - do:\n      info: {}\n',
      'string.yml'
    )
    assert.deepStrictEqual(file.requires.serverlessProject, ['security'])
  })

  it('parses serverless_project as an array', () => {
    const file = parseTestFile(
      '---\nrequires:\n  serverless: true\n  stack: true\n  serverless_project:\n    - security\n    - observability\n---\n"t":\n  - do:\n      info: {}\n',
      'array.yml'
    )
    assert.deepStrictEqual(file.requires.serverlessProject, ['security', 'observability'])
  })

  it('omits serverless_project when absent', () => {
    const file = loadFixture('get.yml')
    assert.equal(file.requires.serverlessProject, undefined)
  })

  it('rejects an unknown serverless_project value', () => {
    assert.throws(
      () => parseTestFile(
        '---\nrequires:\n  serverless: true\n  serverless_project: search\n---\n"t":\n  - do:\n      info: {}\n',
        'bad.yml'
      ),
      /serverless_project must be security, observability, or elasticsearch/
    )
  })

  it('rejects an unknown value inside a serverless_project array', () => {
    assert.throws(
      () => parseTestFile(
        '---\nrequires:\n  serverless: true\n  serverless_project:\n    - security\n    - search\n---\n"t":\n  - do:\n      info: {}\n',
        'bad-array.yml'
      ),
      /serverless_project must be security, observability, or elasticsearch/
    )
  })

  it('parses stack_since', () => {
    const file = parseTestFile(
      '---\nrequires:\n  serverless: true\n  stack: true\n  stack_since: 9.3.0\n---\n"t":\n  - do:\n      info: {}\n',
      'since.yml'
    )
    assert.equal(file.requires.stackSince, '9.3.0')
  })

  it('omits stack_since when absent', () => {
    assert.equal(loadFixture('get.yml').requires.stackSince, undefined)
  })

  it('rejects a non-semver stack_since', () => {
    assert.throws(
      () => parseTestFile('---\nrequires:\n  stack_since: 9.3\n---\n"t":\n  - do:\n      info: {}\n', 'bad-since.yml'),
      /stack_since must be a MAJOR.MINOR.PATCH version/
    )
  })

  it('parses write_temp with variable, content, and suffix', () => {
    const file = loadFixture('write-temp.yml')
    assert.equal(file.setup.length, 1)
    assert.equal(file.setup[0].kind, 'write_temp')
    const step = file.setup[0] as { kind: 'write_temp', varName: string, content: string, suffix?: string }
    assert.equal(step.varName, 'items_file')
    assert.equal(step.content, 'test-import-value\n')
    assert.equal(step.suffix, '.txt')
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

describe('shouldSkipServerlessProject', () => {
  const gated = { serverless: true, stack: true, serverlessProject: ['security'] }
  const open = { serverless: true, stack: true }

  it('does not skip on stack', () => {
    assert.equal(shouldSkipServerlessProject(gated, 'stack', 'elasticsearch'), false)
  })

  it('does not skip when serverless_project is absent', () => {
    assert.equal(shouldSkipServerlessProject(open, 'serverless', 'elasticsearch'), false)
  })

  it('does not skip when the configured project is listed', () => {
    assert.equal(shouldSkipServerlessProject(gated, 'serverless', 'security'), false)
  })

  it('skips when the configured project is not listed', () => {
    assert.equal(shouldSkipServerlessProject(gated, 'serverless', 'elasticsearch'), true)
  })

  it('skips when serverless_project is set and project type is unset', () => {
    assert.equal(shouldSkipServerlessProject(gated, 'serverless', undefined), true)
  })

  it('skips when serverless_project is an empty list', () => {
    assert.equal(
      shouldSkipServerlessProject({ serverless: true, stack: true, serverlessProject: [] }, 'serverless', 'security'),
      true
    )
  })
})

describe('shouldSkipStackVersion', () => {
  const requires = { serverless: true, stack: true, stackSince: '9.3.0' }

  it('skips when the stack is older than stack_since', () => {
    assert.equal(shouldSkipStackVersion(requires, '9.2.8'), true)
    assert.equal(shouldSkipStackVersion(requires, '8.19.10'), true)
  })

  it('runs when the stack is at or newer than stack_since', () => {
    assert.equal(shouldSkipStackVersion(requires, '9.3.0'), false)
    assert.equal(shouldSkipStackVersion(requires, '9.10.0'), false)
    assert.equal(shouldSkipStackVersion(requires, '10.0.0'), false)
  })

  it('never skips without stack_since or a stack version', () => {
    assert.equal(shouldSkipStackVersion({ serverless: true, stack: true }, '9.0.0'), false)
    assert.equal(shouldSkipStackVersion(requires, undefined), false)
  })
})

describe('stackSinceFor', () => {
  const since = { 'esql.get_query': '9.1.0', 'esql.put_view': '9.4.0' }
  const yaml = (requires: string, action: string) =>
    `---\nrequires:\n  stack: true\n${requires}---\nsetup:\n  - do:\n      info: {}\n---\n"t":\n  - do:\n      ${action}: {}\n`

  it('returns the newest since across do-steps and requires.stack_since', () => {
    assert.equal(stackSinceFor(parseTestFile(yaml('', 'esql.put_view'), 'a.yml'), since), '9.4.0')
    assert.equal(stackSinceFor(parseTestFile(yaml('  stack_since: 9.5.0\n', 'esql.get_query'), 'b.yml'), since), '9.5.0')
    assert.equal(stackSinceFor(parseTestFile(yaml('  stack_since: 9.0.0\n', 'esql.get_query'), 'c.yml'), since), '9.1.0')
  })

  it('returns undefined when no action is listed', () => {
    assert.equal(stackSinceFor(parseTestFile(yaml('', 'search'), 'd.yml'), since), undefined)
  })
})
