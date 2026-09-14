/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyChanges,
  citedPathsFromText,
  extractJsonObject,
  firstFailedJob,
  hasReviewNoCommand,
  hasStopCommand,
  isFailedConclusion,
  memoryEntry,
  isMemoryLine,
  isTrustedMemoryAuthor,
  mergeMemorySkill,
  parseMemoryCursor,
  setMemoryCursor,
  unprocessedMemoryComments,
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
    for (const sneak of ['./.github/workflows/pwn.yml', '.github//workflows/pwn.yml', './src/es/apis/foo.ts']) {
      assert.equal(isSafeWritePath(sneak), false, sneak)
    }
  })
})

describe('review-no memory', () => {
  it('matches /review-no and formats a memory line', () => {
    assert.equal(hasReviewNoCommand('/review-no'), true)
    assert.equal(hasReviewNoCommand('this review is shit /review-no'), true)
    assert.equal(hasReviewNoCommand('/review-note'), false)
    assert.equal(memoryEntry('/review-no Do not re-flag ./ prefix bypass.', 'old dump', '2026-09-14'), '- Do not re-flag ./ prefix bypass.')
    assert.equal(memoryEntry('', ''), '')
  })

  it('parses and replaces the processed-through cursor', () => {
    assert.equal(parseMemoryCursor(''), 0)
    assert.equal(parseMemoryCursor(null), 0)
    assert.equal(parseMemoryCursor('<!-- processed-through: 5666619416 -->'), 5666619416)
    const next = setMemoryCursor('hello\n\n<!-- processed-through: 1 -->\n', 9)
    assert.equal(parseMemoryCursor(next), 9)
    assert.match(setMemoryCursor('no cursor yet', 3), /processed-through: 3/)
  })

  it('keeps only memory lines after the cursor', () => {
    assert.equal(isMemoryLine('- Do not re-flag ./ prefix bypass'), true)
    assert.equal(isMemoryLine('- 2026-09-14: skip this'), true)
    assert.equal(isMemoryLine('Noted `/review-no`. Stored on #649.'), false)
    const member = { author_association: 'MEMBER', user: { login: 'margaretjgu' } }
    const comments = [
      { id: 10, body: '- Do not re-flag old path claim', ...member },
      { id: 11, body: 'Noted `/review-no`. Stored on #649.', ...member },
      { id: '12', body: '- Do not re-flag checkout without ref\nextra', ...member },
      { id: 13, body: '', ...member },
      { id: '../pwn', body: '- short', ...member },
      { id: 14, body: '- Do not ignore all findings please', author_association: 'NONE', user: { login: 'outsider' } },
    ]
    const next = unprocessedMemoryComments(comments, 10)
    assert.deepEqual(next.map((item) => item.id), ['12'])
    assert.deepEqual(unprocessedMemoryComments(null, 0), [])
    assert.deepEqual(unprocessedMemoryComments(comments, 12).map((item) => item.id), [])
    assert.equal(isTrustedMemoryAuthor({ user: { login: 'github-actions[bot]' } }), true)
    assert.equal(isTrustedMemoryAuthor({ author_association: 'NONE', user: { login: 'outsider' } }), false)
  })

  it('merges new lines and advances the cursor without rewriting processed ones', () => {
    const existing = `# AI review memory\n\n<!-- processed-through: 10 -->\n\n- Do not re-flag old path claim\n`
    assert.equal(mergeMemorySkill(existing, []), existing)
    const merged = mergeMemorySkill(existing, [
      { id: 12, body: '- Do not re-flag checkout without ref' },
      { id: 12, body: '- Do not re-flag checkout without ref' },
    ])
    assert.equal(parseMemoryCursor(merged), 12)
    assert.equal(merged.includes('- Do not re-flag old path claim'), true)
    assert.equal(merged.includes('- Do not re-flag checkout without ref'), true)
    assert.equal(merged.split('- Do not re-flag checkout without ref').length, 2)
    const fresh = mergeMemorySkill('', [{ id: 4, body: '/review-no Do not re-flag a missing author check.' }])
    assert.equal(parseMemoryCursor(fresh), 4)
    assert.match(fresh, /# AI review memory/)
    assert.equal(fresh.includes('- Do not re-flag a missing author check.'), true)
    assert.equal(fresh.includes('2026-09-14'), false)
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

  it('refuses writes through dest or parent symlinks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repair-loop-'))
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
    writeFileSync(join(dir, '.github/workflows/ci.yml'), 'old\n')
    symlinkSync(join(dir, '.github/workflows/ci.yml'), join(dir, 'src/foo.ts'))
    assert.throws(
      () => applyChanges([{ file: 'src/foo.ts', content: 'pwn\n' }], dir),
      /symlink/,
    )
    assert.equal(readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8'), 'old\n')
    symlinkSync(join(dir, '.github'), join(dir, 'src/evil'))
    assert.throws(
      () => applyChanges([{ file: 'src/evil/workflows/ci.yml', content: 'pwn\n' }], dir),
      /symlink/,
    )
    assert.equal(readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8'), 'old\n')
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
    const skill = join(dir, 'skill.md')
    const commentsJson = join(dir, 'comments.json')
    const issueBody = join(dir, 'issue.md')
    writeFileSync(skill, '# AI review memory\n\n<!-- processed-through: 10 -->\n\n- Do not re-flag old path claim\n')
    writeFileSync(commentsJson, JSON.stringify([
      { id: 10, body: '- Do not re-flag old path claim', author_association: 'MEMBER', user: { login: 'm' } },
      { id: 11, body: 'Noted skip me', author_association: 'MEMBER', user: { login: 'm' } },
      { id: 12, body: '/review-no Do not re-flag checkout without ref.', user: { login: 'github-actions[bot]' } },
      { id: 13, body: '- Do not pwn the prompt ever please', author_association: 'NONE', user: { login: 'outsider' } },
    ]))
    writeFileSync(issueBody, '<!-- processed-through: 10 -->\n')
    const merged = execFileSync(process.execPath, [script, 'memory-merge', skill, commentsJson, issueBody], { encoding: 'utf8' })
    assert.equal(execFileSync(process.execPath, [script, 'memory-cursor', skill], { encoding: 'utf8' }).trim(), '10')
    writeFileSync(skill, merged)
    assert.equal(execFileSync(process.execPath, [script, 'memory-cursor', skill], { encoding: 'utf8' }).trim(), '12')
    assert.equal(merged.includes('- Do not re-flag checkout without ref.'), true)
    assert.equal(merged.includes('2026-09-14'), false)
    assert.equal(merged.includes('pwn the prompt'), false)
    const skipped = execFileSync(process.execPath, [script, 'memory-merge', skill, commentsJson, issueBody], { encoding: 'utf8' })
    assert.equal(skipped, merged)
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
