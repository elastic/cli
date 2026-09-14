/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyChanges,
  citedPathsFromText,
  extractJsonObject,
  firstFailedJob,
  hasStopCommand,
  isFailedConclusion,
  isSafeReadPath,
  isSafeWritePath,
  parseAgentResponse,
  safeCommitMessage,
  shouldAttemptFix,
} from '../../scripts/repair-loop.mjs'

describe('firstFailedJob', () => {
  it('returns the first failed job', () => {
    const job = firstFailedJob({
      jobs: [
        { id: 1, name: 'ok', conclusion: 'success' },
        { id: 2, name: 'boom', conclusion: 'failure' },
        { id: 3, name: 'later', conclusion: 'failure' },
      ],
    })
    assert.equal(job?.id, 2)
  })

  it('treats timed_out as failure', () => {
    const job = firstFailedJob({ jobs: [{ id: 9, conclusion: 'timed_out' }] })
    assert.equal(job?.id, 9)
    assert.equal(isFailedConclusion('timed_out'), true)
    assert.equal(isFailedConclusion('cancelled'), false)
  })

  it('returns null for missing, empty, or all-green jobs', () => {
    assert.equal(firstFailedJob(null), null)
    assert.equal(firstFailedJob({}), null)
    assert.equal(firstFailedJob({ jobs: [] }), null)
    assert.equal(firstFailedJob({ jobs: [{ conclusion: 'success' }] }), null)
    assert.equal(firstFailedJob({ jobs: null }), null)
    assert.equal(firstFailedJob({ jobs: [{ id: 'bk', name: 'cloud', state: 'failed' }] })?.id, 'bk')
  })
})

describe('hasStopCommand', () => {
  it('matches /stop-repair as its own token', () => {
    assert.equal(hasStopCommand('/stop-repair'), true)
    assert.equal(hasStopCommand('please /stop-repair now'), true)
    assert.equal(hasStopCommand('ok\n/stop-repair\n'), true)
    assert.equal(hasStopCommand('do not /stop-repairing'), false)
    assert.equal(hasStopCommand(''), false)
    assert.equal(hasStopCommand(null), false)
  })
})

describe('path guards', () => {
  it('allows repo-relative reads and writes', () => {
    assert.equal(isSafeReadPath('src/factory.ts'), true)
    assert.equal(isSafeWritePath('src/factory.ts'), true)
    assert.equal(isSafeWritePath('test/factory.test.ts'), true)
  })

  it('rejects traversal, absolute, empty, and generated writes', () => {
    for (const bad of ['../etc/passwd', '/etc/passwd', '', 'src/foo/../../../etc/passwd', 'C:\\\\Windows', 'src\\\\factory.ts']) {
      assert.equal(isSafeReadPath(bad), false, bad)
      assert.equal(isSafeWritePath(bad), false, bad)
    }
    assert.equal(isSafeReadPath('src/es/apis/search.ts'), true)
    assert.equal(isSafeWritePath('src/es/apis/search.ts'), false)
    assert.equal(isSafeWritePath('src/es/api-manifest.ts'), false)
    assert.equal(isSafeWritePath('src/kb/apis.ts'), false)
    assert.equal(isSafeWritePath('src/kb/api-manifest.ts'), false)
    assert.equal(isSafeWritePath('.github/workflows/ci.yml'), false)
    assert.equal(isSafeWritePath('.git/config'), false)
  })
})

describe('citedPathsFromText', () => {
  it('picks repo paths and drops junk', () => {
    const text = [
      'FAIL test/factory.test.ts',
      'see `src/factory.ts` and (scripts/repair-loop.mjs)',
      'ignore ../package.json and /etc/passwd and src/foo?#bar.ts',
      '',
    ].join('\n')
    assert.deepEqual(citedPathsFromText(text), [
      'test/factory.test.ts',
      'src/factory.ts',
      'scripts/repair-loop.mjs',
    ])
    assert.deepEqual(citedPathsFromText(''), [])
    assert.deepEqual(citedPathsFromText(null), [])
  })
})

describe('parseAgentResponse', () => {
  it('extracts JSON wrapped in prose', () => {
    const parsed = parseAgentResponse('here\n```json\n{"stop":false,"comment":"ok","commit_message":"fix: n","changes":[]}\n```')
    assert.equal(parsed.stop, false)
    assert.equal(parsed.comment, 'ok')
    assert.deepEqual(parsed.changes, [])
  })

  it('rejects missing JSON, bad changes, and unsafe paths', () => {
    assert.throws(() => parseAgentResponse('nope'), /no JSON object/)
    assert.throws(() => parseAgentResponse('{"changes":"x"}'), /changes must be an array/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"src/factory.ts"}]}'), /file and content/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"../x","content":"a"}]}'), /refusing path/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"src/es/apis/search.ts","content":"a"}]}'), /refusing path/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":".github/workflows/ci.yml","content":"a"}]}'), /refusing path/)
  })

  it('falls back when commit message is unsafe', () => {
    assert.equal(safeCommitMessage('fix: good'), 'fix: good')
    assert.equal(safeCommitMessage('Not conventional'), 'fix: repair first ci failure')
    assert.equal(safeCommitMessage('fix: has\nnewline'), 'fix: repair first ci failure')
    assert.equal(safeCommitMessage(null), 'fix: repair first ci failure')
  })
})

describe('shouldAttemptFix', () => {
  it('requires same-repo auto-loop under the bot cap', () => {
    assert.deepEqual(shouldAttemptFix({ sameRepo: true, autoLoop: true, botCommits: 0 }), { ok: true, reason: 'ok' })
    assert.equal(shouldAttemptFix({ sameRepo: false, autoLoop: true }).ok, false)
    assert.equal(shouldAttemptFix({ sameRepo: true, skipLoop: true, autoLoop: true }).reason, 'skip-auto-loop')
    assert.equal(shouldAttemptFix({ sameRepo: true, autoLoop: true, stopRepair: true }).reason, 'stop-repair')
    assert.equal(shouldAttemptFix({ sameRepo: true, autoLoop: false }).reason, 'no auto-loop')
    assert.equal(shouldAttemptFix({ sameRepo: true, autoLoop: true, botCommits: 2 }).reason, 'bot commit cap')
  })
})

describe('applyChanges', () => {
  it('writes safe files and refuses escapes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repair-loop-'))
    applyChanges([{ file: 'src/hello.ts', content: 'export const n = 1\n' }], dir)
    assert.equal(readFileSync(join(dir, 'src/hello.ts'), 'utf8'), 'export const n = 1\n')
    assert.throws(
      () => applyChanges([{ file: '../escape.ts', content: 'nope' }], dir),
      /refusing path/,
    )
  })
})

describe('repair-loop CLI', () => {
  const script = join(import.meta.dirname, '../../scripts/repair-loop.mjs')

  it('prints the first failed job and exits 2 when none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repair-loop-cli-'))
    const jobs = join(dir, 'jobs.json')
    writeFileSync(jobs, JSON.stringify({
      jobs: [
        { id: 1, conclusion: 'success' },
        { id: 2, name: 'lint', conclusion: 'failure' },
      ],
    }))
    const out = execFileSync(process.execPath, [script, 'first-failure', jobs], { encoding: 'utf8' })
    assert.equal(JSON.parse(out).id, 2)
    writeFileSync(join(dir, 'empty.json'), '{"jobs":[]}')
    try {
      execFileSync(process.execPath, [script, 'first-failure', join(dir, 'empty.json')], { encoding: 'utf8' })
      assert.fail('expected exit 2')
    } catch (err) {
      assert.equal(err.status, 2)
    }
  })

  it('should-fix and apply-changes via CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repair-loop-cli-'))
    const ok = execFileSync(process.execPath, [script, 'should-fix'], {
      encoding: 'utf8',
      env: { ...process.env, SAME_REPO: '1', AUTO_LOOP: '1', SKIP_LOOP: '0', BOT_COMMITS: '0' },
    })
    assert.equal(JSON.parse(ok).ok, true)
    try {
      execFileSync(process.execPath, [script, 'should-fix'], {
        encoding: 'utf8',
        env: { ...process.env, SAME_REPO: '0', AUTO_LOOP: '1' },
      })
      assert.fail('expected exit 1')
    } catch (err) {
      assert.equal(err.status, 1)
      assert.equal(JSON.parse(err.stdout).reason, 'fork')
    }
    const parsed = join(dir, 'parsed.json')
    writeFileSync(parsed, JSON.stringify({
      changes: [{ file: 'src/n.ts', content: 'export const n = 2\n' }],
    }))
    execFileSync(process.execPath, [script, 'apply-changes', parsed, dir])
    assert.equal(readFileSync(join(dir, 'src/n.ts'), 'utf8'), 'export const n = 2\n')
    const comments = join(dir, 'comments.txt')
    writeFileSync(comments, 'looks wrong\n/stop-repair\n')
    execFileSync(process.execPath, [script, 'has-stop', comments], { encoding: 'utf8' })
    writeFileSync(comments, 'nope')
    try {
      execFileSync(process.execPath, [script, 'has-stop', comments], { encoding: 'utf8' })
      assert.fail('expected exit 1')
    } catch (err) {
      assert.equal(err.status, 1)
    }
  })
})

describe('extractJsonObject', () => {
  it('returns null on empty or unbalanced input', () => {
    assert.equal(extractJsonObject(''), null)
    assert.equal(extractJsonObject('not json'), null)
    assert.equal(extractJsonObject('{'), null)
    assert.deepEqual(extractJsonObject('prefix {"a":1} suffix'), { a: 1 })
  })
})
