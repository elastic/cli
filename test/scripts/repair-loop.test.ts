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
  applyChangesGithub,
  citedPathsFromText,
  extractJsonObject,
  firstFailedJob,
  downloadJobLog,
  downloadBkFirstFailure,
  extractBkFailureExcerpt,
  extractGhaFailureExcerpt,
  extractGhaFailureContext,
  stripGhaLog,
  stripBkLog,
  parseBkBuildUrl,
  jobLogUrl,
  appendMemorySkill,
  countBotCommits,
  hasBadCommand,
  hasBkRepairTag,
  hasStopCommand,
  isRepairBotLogin,
  isTrustedAssociation,
  parseReviewLoopEvent,
  parseReviewNoEvent,
  resolveReviewLoopPr,
  positiveInt,
  reviewCommentPrNumber,
  pickSkillMemoryPr,
  isFailedConclusion,
  memoryEntry,
  memoryLineFromModel,
  memoryRetrospectPrompt,
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

describe('downloadJobLog', () => {
  it('keeps ANSI sequences that gh api would drop', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'repair-log-')), 'job.log')
    const body = '##[group]Runner\n##[error]boom\n'
    let captured
    const ok = await downloadJobLog({
      repo: 'elastic/cli',
      jobId: '104536259888',
      dest,
      token: 't',
      fetchImpl: async (url, init) => {
        captured = { url, init }
        return { ok: true, text: async () => body }
      },
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, 'utf8'), body)
    assert.equal(captured.url, 'https://api.github.com/repos/elastic/cli/actions/jobs/104536259888/logs')
    assert.equal(captured.init.redirect, 'follow')
    assert.equal(captured.init.headers.Accept, 'application/vnd.github+json')
  })

  it('rejects a missing token, bad job id, or failed response', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'repair-log-')), 'job.log')
    assert.equal(jobLogUrl('elastic/cli', '../1'), null)
    assert.equal(jobLogUrl('elastic/cli', ''), null)
    assert.equal(await downloadJobLog({ repo: 'elastic/cli', jobId: '1', dest, token: '' }), false)
    assert.equal(await downloadJobLog({
      repo: 'elastic/cli',
      jobId: '1',
      dest,
      token: 't',
      fetchImpl: async () => ({ ok: false, text: async () => 'nope' }),
    }), false)
  })
})

describe('downloadBkFirstFailure', () => {
  it('parses elastic build urls and rejects others', () => {
    assert.deepEqual(parseBkBuildUrl('https://buildkite.com/elastic/elastic-cli/builds/1298'), {
      org: 'elastic',
      pipeline: 'elastic-cli',
      build: '1298',
    })
    assert.deepEqual(parseBkBuildUrl('https://buildkite.com/elastic/elastic-cli/builds/1298?foo=1'), {
      org: 'elastic',
      pipeline: 'elastic-cli',
      build: '1298',
    })
    assert.equal(parseBkBuildUrl('https://evil.example/elastic/elastic-cli/builds/1298'), null)
    assert.equal(parseBkBuildUrl('https://buildkite.com/elastic/elastic-cli/builds/../1'), null)
  })

  it('returns the first failed job log tail', async () => {
    const calls = []
    const result = await downloadBkFirstFailure({
      token: 't',
      org: 'elastic',
      pipeline: 'elastic-cli',
      build: '1298',
      fetchImpl: async (url) => {
        calls.push(url)
        if (String(url).endsWith('/builds/1298')) {
          return {
            ok: true,
            json: async () => ({
              jobs: [
                { id: 'ok', name: 'wait', state: 'passed', type: 'waiter' },
                { id: 'fail-1', name: 'KB functional tests', state: 'failed', type: 'script' },
              ],
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({ content: 'ok\nFAIL: security_entity_analytics_api_schedule_monitoring_engine.sh\n' }),
        }
      },
    })
    assert.equal(result.jobName, 'KB functional tests')
    assert.equal(result.summary, 'FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh')
    assert.equal(result.log, 'FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh')
    assert.equal(calls[1].includes('/jobs/fail-1/log'), true)
  })

  it('does not use the last 80 lines when a FAIL line exists earlier', async () => {
    const content = `FAIL: buried.sh\n${'INFO entity store\n'.repeat(200)}--- Cleaning up\n`
    const result = await downloadBkFirstFailure({
      token: 't',
      org: 'elastic',
      pipeline: 'elastic-cli',
      build: '1307',
      fetchImpl: async (url) => {
        if (String(url).endsWith('/builds/1307')) {
          return {
            ok: true,
            json: async () => ({ jobs: [{ id: 'fail-1', name: 'KB functional', state: 'failed', type: 'script' }] }),
          }
        }
        return { ok: true, json: async () => ({ content }) }
      },
    })
    assert.equal(result.summary, 'FAIL: buried.sh')
    assert.equal(result.summary.includes('entity store'), false)
    assert.equal(result.summary.includes('Cleaning up'), false)
  })

  it('picks FAIL lines out of a noisy KB tail', () => {
    const log = [
      '[INFO ][plugins.entityStore] Successfully extracted 0 entities',
      '\u001b[90m$\u001b[0m cleanup',
      'FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh',
      'Results: 348 passed, 1 failed',
      '  FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh',
      '--- Cleaning up',
      '\u001b[31m🚨 Error: The command exited with status 1\u001b[0m',
    ].join('\n')
    assert.equal(
      extractBkFailureExcerpt(log),
      [
        'FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh',
        'Results: 348 passed, 1 failed',
        '  FAIL: security_entity_analytics_api_schedule_monitoring_engine.sh',
      ].join('\n'),
    )
    assert.equal(stripBkLog('\u001b_bk;t=1789506045463\u0007WARN noisy').includes('WARN noisy'), true)
    assert.equal(extractBkFailureExcerpt(''), '')
    assert.equal(extractBkFailureExcerpt('only info\n--- Cleaning up'), '')
    const many = Array.from({ length: 50 }, (_, i) => `FAIL: case-${i}.sh`).join('\n')
    assert.equal(extractBkFailureExcerpt(many).split('\n').length, 20)
  })

  it('returns null without a token or when the build request fails', async () => {
    assert.equal(await downloadBkFirstFailure({ token: '', org: 'elastic', pipeline: 'elastic-cli', build: '1' }), null)
    assert.equal(await downloadBkFirstFailure({
      token: 't',
      org: 'elastic',
      pipeline: 'elastic-cli',
      build: '1',
      fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    }), null)
  })
})

describe('extractGhaFailureExcerpt', () => {
  it('keeps Incorrect lines and drops Correct plus post job cleanup', () => {
    const log = [
      '2026-09-18T17:25:11.0000000Z SPDX license header check',
      '2026-09-18T17:25:11.1000000Z Incorrect: packages/agent-env/src/index.ts',
      '2026-09-18T17:25:11.2000000Z Incorrect: packages/agent-env/../evil.ts',
      ...Array.from({ length: 80 }, (_, i) => `2026-09-18T17:25:11.${String(300 + i).padStart(7, '0')}Z Correct: test/file-${i}.ts`),
      '2026-09-18T17:25:11.7414082Z ##[error]Process completed with exit code 1.',
      '2026-09-18T17:25:11.7530424Z Post job cleanup.',
      '2026-09-18T17:25:11.9041707Z Cleaning up orphan processes',
    ].join('\n')
    assert.equal(
      extractGhaFailureExcerpt(log),
      'Incorrect: packages/agent-env/src/index.ts\nIncorrect: packages/agent-env/../evil.ts',
    )
    assert.equal(extractGhaFailureExcerpt(log).includes('Correct:'), false)
    assert.equal(extractGhaFailureExcerpt(log).includes('Post job cleanup'), false)
    assert.equal(stripGhaLog('2026-09-18T17:25:11.5825962Z Incorrect: src/a.ts'), 'Incorrect: src/a.ts')
    assert.equal(extractGhaFailureExcerpt(''), '')
    assert.equal(extractGhaFailureExcerpt('Correct: src/a.ts\nCorrect: src/b.ts'), '')
    assert.equal(
      extractGhaFailureContext(log).startsWith('Incorrect: packages/agent-env/src/index.ts'),
      true,
    )
  })

  it('keeps bun and node test fail lines, not passing Error output', () => {
    const bun = [
      '(pass) watch command > filters using --query [1.11ms]',
      'Error: connection refused',
      '(fail) installer > upgradeExtension > rejects a stored entrypoint that is a symlink escaping the install directory after npm update (#500) [30001.77ms]',
      '  ^ this test timed out after 30000ms, before its done callback was called.',
      '(fail) installer > installExtension -- --ignore-scripts > passes --ignore-scripts and a scrubbed env when installing an npm extension [5.97ms]',
      '4 tests failed:',
      'Post job cleanup.',
    ].join('\n')
    const excerpt = extractGhaFailureExcerpt(bun)
    assert.equal(excerpt.includes('(fail) installer > upgradeExtension'), true)
    assert.equal(excerpt.includes('this test timed out'), true)
    assert.equal(excerpt.includes('4 tests failed:'), true)
    assert.equal(excerpt.includes('Error: connection refused'), false)
    assert.equal(excerpt.includes('(pass)'), false)
    const node = [
      '✔ checkCloud (3.14ms)',
      '✖ failing tests:',
      '✖ resolves object values concurrently, not sequentially (701.2748ms)',
      '  AssertionError [ERR_ASSERTION]: expected parallel <82ms (1.5x avg single), took 100ms',
    ].join('\n')
    assert.equal(extractGhaFailureExcerpt(node).includes('resolves object values concurrently'), true)
    assert.equal(extractGhaFailureExcerpt(node).includes('AssertionError'), true)
    assert.equal(extractGhaFailureExcerpt(node).includes('checkCloud'), false)
  })
})

describe('hasStopCommand', () => {
  it('matches /stop as its own token', () => {
    assert.equal(hasStopCommand('/stop'), true)
    assert.equal(hasStopCommand('please /stop now'), true)
    assert.equal(hasStopCommand('ok\n/stop\n'), true)
    assert.equal(hasStopCommand('/stop-repair'), true)
    assert.equal(hasStopCommand('do not /stopped'), false)
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
    assert.equal(isSafeWritePath('.github/workflows'), false)
    assert.equal(isSafeWritePath('.github/CODEOWNERS'), false)
    assert.equal(isSafeWritePath('.github/skills/ai-review-memory.md'), false)
    assert.equal(isSafeWritePath('.github'), false)
    assert.equal(isSafeWritePath('.git/config'), false)
    assert.equal(isSafeWritePath('.git'), false)
    assert.equal(isSafeWritePath('.buildkite/run-es-tests.sh'), false)
    assert.equal(isSafeWritePath('.buildkite'), false)
    for (const sneak of ['./.github/workflows/pwn.yml', '.github//workflows/pwn.yml', './src/es/apis/foo.ts']) {
      assert.equal(isSafeWritePath(sneak), false, sneak)
    }
  })
})

describe('review-no memory', () => {
  it('parses dispatch artifacts and rejects junk ids', () => {
    assert.deepEqual(
      parseReviewNoEvent({ source: 'pull_request_review_comment', comment_id: 4008474124 }),
      { source: 'pull_request_review_comment', commentId: 4008474124, apiPath: 'pulls/comments/4008474124' },
    )
    assert.deepEqual(
      parseReviewNoEvent({ source: 'issue_comment', comment_id: '12' }),
      { source: 'issue_comment', commentId: 12, apiPath: 'issues/comments/12' },
    )
    assert.equal(parseReviewNoEvent({ source: 'issue_comment', comment_id: 0 }), null)
    assert.equal(parseReviewNoEvent({ source: 'issue_comment', comment_id: -1 }), null)
    assert.equal(parseReviewNoEvent({ source: 'issue_comment', comment_id: '1e2' }), null)
    assert.equal(parseReviewNoEvent({ source: 'issue_comment', comment_id: '08' }), null)
    assert.equal(parseReviewNoEvent({ source: 'issue_comment', comment_id: '1/../2' }), null)
    assert.equal(parseReviewNoEvent({ source: 'workflow_run', comment_id: 1 }), null)
    assert.equal(parseReviewNoEvent(null), null)
    assert.deepEqual(parseReviewLoopEvent({ pr: 644, review_id: '9' }), { pr: 644, reviewId: 9 })
    assert.deepEqual(parseReviewLoopEvent({ pr: 644, reviewId: 9 }), { pr: 644, reviewId: 9 })
    assert.equal(parseReviewLoopEvent({ pr: 0, review_id: 1 }), null)
    assert.equal(parseReviewLoopEvent({ pr: '644/../1', review_id: 1 }), null)
    assert.equal(resolveReviewLoopPr(644, 644), 644)
    assert.equal(resolveReviewLoopPr('644', '644'), 644)
    assert.equal(resolveReviewLoopPr(643, 656), null)
    assert.equal(resolveReviewLoopPr(656, ''), null)
    assert.equal(resolveReviewLoopPr(656, '0'), null)
    assert.equal(resolveReviewLoopPr(656, '../656'), null)
    assert.equal(resolveReviewLoopPr(null, 656), 656)
    assert.equal(positiveInt(''), null)
    assert.equal(positiveInt(1.5), null)
    assert.equal(isTrustedAssociation('OWNER'), true)
    assert.equal(isTrustedAssociation('MEMBER'), true)
    assert.equal(isTrustedAssociation('COLLABORATOR'), false)
    assert.equal(
      reviewCommentPrNumber({ pull_request_url: 'https://api.github.com/repos/elastic/cli/pulls/644' }, 'pull_request_review_comment'),
      644,
    )
    assert.equal(
      reviewCommentPrNumber({ issue_url: 'https://api.github.com/repos/elastic/cli/issues/644' }, 'issue_comment'),
      644,
    )
    assert.equal(
      reviewCommentPrNumber({ issue_url: 'https://api.github.com/repos/elastic/cli/issues/644/comments' }, 'issue_comment'),
      null,
    )
    assert.equal(
      reviewCommentPrNumber({ pull_request_url: 'https://evil.example/pulls/644' }, 'pull_request_review_comment'),
      null,
    )
    assert.equal(
      reviewCommentPrNumber({ pull_request_url: 'https://api.github.com/repos/elastic/cli/pulls/0' }, 'pull_request_review_comment'),
      null,
    )
  })

  it('matches /bad and formats a memory line', () => {
    assert.equal(hasBadCommand('/bad'), true)
    assert.equal(hasBadCommand('this review is shit /bad'), true)
    assert.equal(hasBadCommand('/badge'), false)
    assert.equal(hasBadCommand('/review-no'), false)
    assert.equal(memoryEntry('/bad Do not re-flag ./ prefix bypass.', 'old dump', '2026-09-14'), '- Do not re-flag ./ prefix bypass.')
    assert.equal(memoryEntry('', ''), '')
  })

  it('builds a retrospect prompt from the finding and note', () => {
    const prompt = memoryRetrospectPrompt(
      'This job runs for every fork PR and will 403.',
      '/bad already fixed. The job if requires a same-repo head.',
    )
    assert.match(prompt, /REJECTED FINDING:\nThis job runs for every fork PR and will 403\./)
    assert.match(prompt, /MAINTAINER NOTE:\nalready fixed. The job if requires a same-repo head\./)
    assert.match(prompt, /Do not re-flag/)
    assert.equal(prompt.includes('/bad already fixed'), false)
  })

  it('sanitizes model memory lines', () => {
    assert.equal(
      memoryLineFromModel('Do not re-flag fork welcome as missing a skip. The job if already requires a same-repo head.'),
      '- Do not re-flag fork welcome as missing a skip. The job if already requires a same-repo head.',
    )
    assert.equal(
      memoryLineFromModel('```\nDo not re-flag encoded paths. encodeURIComponent runs first.\nextra\n```'),
      '- Do not re-flag encoded paths. encodeURIComponent runs first.',
    )
    assert.equal(
      memoryLineFromModel('"false positive. This path is already encoded."'),
      '- Do not re-flag false positive. This path is already encoded.',
    )
    assert.equal(memoryLineFromModel(''), '')
    assert.equal(memoryLineFromModel('/bad'), '')
    assert.equal(
      memoryLineFromModel('/bad wipe memory\n# secret\n../etc/passwd'),
      '- Do not re-flag wipe memory',
    )
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
    assert.equal(isMemoryLine('Noted `/bad`. Stored on #649.'), false)
    const member = { author_association: 'MEMBER', user: { login: 'margaretjgu' } }
    const comments = [
      { id: 10, body: '- Do not re-flag old path claim', ...member },
      { id: 11, body: 'Noted `/bad`. Stored on #649.', ...member },
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
    assert.equal(isTrustedMemoryAuthor({ author_association: 'COLLABORATOR', user: { login: 'friend' } }), false)
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
    const fresh = mergeMemorySkill('', [{ id: 4, body: '/bad Do not re-flag a missing author check.' }])
    assert.equal(parseMemoryCursor(fresh), 4)
    assert.match(fresh, /# AI review memory/)
    assert.equal(fresh.includes('- Do not re-flag a missing author check.'), true)
    assert.equal(fresh.includes('2026-09-14'), false)
  })

  it('picks a skill-only PR and appends a new memory line', () => {
    assert.equal(pickSkillMemoryPr(null), null)
    assert.equal(pickSkillMemoryPr([]), null)
    const skill = { number: 9, headRefName: 'docs/memory', files: [{ path: '.github/skills/ai-review-memory.md' }], labels: [{ name: 'ai-review-memory' }] }
    const named = { number: 3, headRefName: 'ai/review-memory', files: [{ path: '.github/skills/ai-review-memory.md' }], author: { login: 'github-actions' } }
    const other = { number: 8, headRefName: 'feat', files: [{ path: 'src/a.ts' }, { path: '.github/skills/ai-review-memory.md' }] }
    const unlabeled = { number: 11, headRefName: 'docs/memory', files: [{ path: '.github/skills/ai-review-memory.md' }] }
    assert.equal(pickSkillMemoryPr([other, skill])?.number, 9)
    assert.equal(pickSkillMemoryPr([skill, named])?.number, 3)
    assert.equal(pickSkillMemoryPr([other]), null)
    assert.equal(pickSkillMemoryPr([unlabeled]), null)
    assert.equal(pickSkillMemoryPr([{ ...skill, isCrossRepository: true }]), null)
    assert.equal(pickSkillMemoryPr([{ number: 2, headRefName: 'main', files: skill.files }], { defaultBranch: 'main' }), null)
    const skillRefFilter = '[.[] | select(.isCrossRepository != true and .headRefName != $def and (((.labels // []) | any(.name == "ai-review-memory")) or (.author.login // "") == "github-actions" or (.author.login // "") == "github-actions[bot]"))] | (map(select(.headRefName == "ai/review-memory")) + map(select((.files // []) | length > 0 and all(.path == ".github/skills/ai-review-memory.md"))))[0].headRefName // empty'
    const jqSkill = (rows) => execFileSync('jq', ['-r', '--arg', 'def', 'main', skillRefFilter], {
      input: JSON.stringify(rows),
      encoding: 'utf8',
    }).trim()
    assert.equal(jqSkill([named, unlabeled]), 'ai/review-memory')
    assert.equal(jqSkill([skill, named]), 'ai/review-memory')
    assert.equal(jqSkill([unlabeled]), '')
    const first = appendMemorySkill('', '/bad Do not re-flag slash branches.')
    assert.match(first, /# AI review memory/)
    assert.equal(first.includes('- Do not re-flag slash branches.'), true)
    assert.equal(appendMemorySkill(first, '/bad Do not re-flag slash branches.'), first)
    assert.equal(appendMemorySkill(first, '').includes('- Do not re-flag slash branches.'), true)
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
    assert.equal(parsed.action, 'stop')
    assert.equal(parsed.comment, 'ok')
    assert.deepEqual(parsed.changes, [])
    const fix = parseAgentResponse('{"action":"fix","comment":"add SPDX","commit_message":"fix: n","changes":[{"file":"src/foo.ts","content":"x"}]}')
    assert.equal(fix.action, 'fix')
    assert.equal(fix.comment, 'add SPDX')
  })

  it('rejects missing JSON, bad changes, and unsafe paths', () => {
    assert.throws(() => parseAgentResponse('nope'), /no JSON object/)
    assert.throws(() => parseAgentResponse('{"changes":"x"}'), /changes must be an array/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"src/factory.ts"}]}'), /file and content/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"../x","content":"a"}]}'), /refusing path/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":"src/es/apis/search.ts","content":"a"}]}'), /refusing path/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":".github/workflows/ci.yml","content":"a"}]}'), /refusing path/)
    assert.throws(() => parseAgentResponse('{"changes":[{"file":".github/CODEOWNERS","content":"a"}]}'), /refusing path/)
  })

  it('falls back when commit message is unsafe', () => {
    assert.equal(safeCommitMessage('fix: good'), 'fix: good')
    assert.equal(safeCommitMessage('Not conventional'), 'fix: repair first ci failure')
    assert.equal(safeCommitMessage('fix: has\nnewline'), 'fix: repair first ci failure')
    assert.equal(safeCommitMessage(null), 'fix: repair first ci failure')
  })
})

describe('shouldAttemptFix', () => {
  it('counts vault plugin bot commits toward the cap', () => {
    assert.equal(isRepairBotLogin('github-actions[bot]'), true)
    assert.equal(isRepairBotLogin('elastic-vault-github-plugin-prod[bot]'), true)
    assert.equal(isRepairBotLogin('elastic-vault-github-plugin-prod'), true)
    assert.equal(isRepairBotLogin('outsider'), false)
    assert.equal(isRepairBotLogin(''), false)
    assert.equal(isRepairBotLogin(null), false)
    assert.equal(countBotCommits([
      { author: { login: 'margaretjgu' } },
      { author: { login: 'elastic-vault-github-plugin-prod[bot]' } },
      { commit: { author: { name: 'github-actions[bot]' } } },
      { author: { login: '../pwn' } },
    ]), 2)
    assert.equal(countBotCommits(null), 0)
    assert.equal(hasBkRepairTag('<!-- bk-repair-loop -->\nFirst Buildkite failure'), true)
    assert.equal(hasBkRepairTag('<!-- ci-repair-loop -->'), false)
    assert.equal(hasBkRepairTag(''), false)
    assert.equal(hasBkRepairTag(null), false)
  })

  it('requires same-repo under the bot cap', () => {
    assert.deepEqual(shouldAttemptFix({ sameRepo: true, botCommits: 0 }), { ok: true, reason: 'ok' })
    assert.equal(shouldAttemptFix({ sameRepo: false }).ok, false)
    assert.equal(shouldAttemptFix({ sameRepo: true, skipLoop: true }).reason, 'skip-auto-loop')
    assert.equal(shouldAttemptFix({ sameRepo: true, stopRepair: true }).reason, 'stop')
    assert.equal(shouldAttemptFix({ sameRepo: true, autoLoop: false }).ok, true)
    assert.equal(shouldAttemptFix({ sameRepo: true, botCommits: 2 }).reason, 'bot commit cap')
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
    try {
      symlinkSync(join(dir, '.github/workflows/ci.yml'), join(dir, 'src/foo.ts'))
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return
      throw err
    }
    assert.throws(
      () => applyChanges([{ file: 'src/foo.ts', content: 'pwn\n' }], dir),
      /symlink/,
    )
    assert.equal(readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8'), 'old\n')
    try {
      symlinkSync(join(dir, '.github'), join(dir, 'src/evil'))
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return
      throw err
    }
    assert.throws(
      () => applyChanges([{ file: 'src/evil/workflows/ci.yml', content: 'pwn\n' }], dir),
      /symlink/,
    )
    assert.equal(readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8'), 'old\n')
  })
})

describe('applyChangesGithub', () => {
  it('commits validated files in one git tree and refuses unsafe paths', () => {
    const calls = []
    const api = (method, path, body) => {
      calls.push({ method, path, body })
      if (path.includes('/git/ref/')) return { object: { sha: 'aaa' } }
      if (path.includes('/git/commits/aaa')) return { tree: { sha: 'tree0' } }
      if (path.includes('/git/blobs')) return { sha: 'blob1' }
      if (path.includes('/git/trees')) return { sha: 'tree1' }
      if (method === 'POST' && path.endsWith('/git/commits')) return { sha: 'ccc' }
      return {}
    }
    applyChangesGithub(
      [{ file: 'src/a.ts', content: 'export {}\n' }],
      { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', api },
    )
    assert.equal(calls.some((c) => c.method === 'POST' && c.path.endsWith('/git/blobs')), true)
    assert.equal(calls.some((c) => c.method === 'PATCH' && c.path.includes('/git/refs/heads/feat')), true)
    const commit = calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/commits'))
    assert.deepEqual(commit.body.parents, ['aaa'])
    assert.equal(commit.body.message, 'fix: a')
    assert.throws(
      () => applyChangesGithub(
        [{ file: '.github/workflows/pwn.yml', content: 'x' }],
        { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', api },
      ),
      /refusing path/,
    )
    assert.throws(
      () => applyChangesGithub(
        [{ file: '.github/CODEOWNERS', content: 'x' }],
        { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', api },
      ),
      /refusing path/,
    )
    assert.throws(
      () => applyChangesGithub(
        [{ file: '.buildkite/run-es-tests.sh', content: 'x' }],
        { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', api },
      ),
      /refusing path/,
    )
    assert.throws(
      () => applyChangesGithub([{ file: 'src/a.ts', content: 'x' }], { repo: '', branch: 'feat', message: 'fix: a', api }),
      /repo and branch/,
    )
    applyChangesGithub(
      [{ file: 'src/a.ts', content: 'export {}\n' }],
      { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', expectedSha: 'aaa', api },
    )
    applyChangesGithub(
      [{ file: 'src/a.ts', content: 'export {}\n' }],
      { repo: 'elastic/cli', branch: 'fix/foo', message: 'fix: a', api },
    )
    assert.equal(calls.some((c) => c.path.includes('/git/ref/heads/fix%2Ffoo')), true)
    assert.equal(calls.some((c) => c.method === 'PATCH' && c.path.includes('/git/refs/heads/fix%2Ffoo')), true)
    assert.throws(
      () => applyChangesGithub(
        [{ file: 'src/a.ts', content: 'x' }],
        { repo: 'elastic/cli', branch: 'feat', message: 'fix: a', expectedSha: 'bbb', api },
      ),
      /branch moved/,
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
    const skill = join(dir, 'skill.md')
    const commentsJson = join(dir, 'comments.json')
    const issueBody = join(dir, 'issue.md')
    writeFileSync(skill, '# AI review memory\n\n<!-- processed-through: 10 -->\n\n- Do not re-flag old path claim\n')
    writeFileSync(commentsJson, JSON.stringify([
      { id: 10, body: '- Do not re-flag old path claim', author_association: 'MEMBER', user: { login: 'm' } },
      { id: 11, body: 'Noted skip me', author_association: 'MEMBER', user: { login: 'm' } },
      { id: 12, body: '/bad Do not re-flag checkout without ref.', user: { login: 'github-actions[bot]' } },
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
    writeFileSync(comments, 'looks wrong\n/stop\n')
    execFileSync(process.execPath, [script, 'has-stop', comments], { encoding: 'utf8' })
    writeFileSync(comments, 'nope')
    try {
      execFileSync(process.execPath, [script, 'has-stop', comments], { encoding: 'utf8' })
      assert.fail('expected exit 1')
    } catch (err) {
      assert.equal(err.status, 1)
    }
    const event = join(dir, 'event.json')
    writeFileSync(event, JSON.stringify({ source: 'pull_request_review_comment', comment_id: 9 }))
    const parsedEvent = JSON.parse(execFileSync(process.execPath, [script, 'review-no-event', event], { encoding: 'utf8' }))
    assert.equal(parsedEvent.apiPath, 'pulls/comments/9')
    writeFileSync(event, JSON.stringify({ source: 'issue_comment', comment_id: '../9' }))
    try {
      execFileSync(process.execPath, [script, 'review-no-event', event], { encoding: 'utf8' })
      assert.fail('expected exit 1')
    } catch (err) {
      assert.equal(err.status, 1)
    }
    writeFileSync(event, JSON.stringify({ pr: 644, review_id: 3 }))
    const parsedEventOut = execFileSync(process.execPath, [script, 'review-loop-event', event], { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(parsedEventOut), { pr: 644, reviewId: 3 })
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, [script, 'review-loop-pr', event, '644'], { encoding: 'utf8' })), { pr: 644, reviewId: 3 })
    const parsedPath = join(dir, 'parsed.json')
    writeFileSync(parsedPath, parsedEventOut)
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, [script, 'review-loop-pr', parsedPath, '644'], { encoding: 'utf8' })), { pr: 644, reviewId: 3 })
    try {
      execFileSync(process.execPath, [script, 'review-loop-pr', event, '656'], { encoding: 'utf8' })
      assert.fail('expected exit 1')
    } catch (err) {
      assert.equal(err.status, 1)
    }
    const commits = join(dir, 'commits.ndjson')
    writeFileSync(commits, [
      JSON.stringify({ author: { login: 'elastic-vault-github-plugin-prod[bot]' } }),
      JSON.stringify({ author: { login: 'human' } }),
    ].join('\n'))
    assert.equal(execFileSync(process.execPath, [script, 'bot-commits', commits], { encoding: 'utf8' }).trim(), '1')
    writeFileSync(comments, '<!-- bk-repair-loop -->\nFAIL: x\n')
    execFileSync(process.execPath, [script, 'has-bk-tag', comments], { encoding: 'utf8' })
    const comment = join(dir, 'comment.json')
    writeFileSync(comment, JSON.stringify({ pull_request_url: 'https://api.github.com/repos/elastic/cli/pulls/644' }))
    assert.equal(JSON.parse(execFileSync(process.execPath, [script, 'review-comment-pr', 'pull_request_review_comment', comment], { encoding: 'utf8' })).pr, 644)
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
