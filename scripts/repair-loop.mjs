#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const GENERATED = [
  /^src\/es\/apis\//,
  /^src\/es\/api-manifest\.ts$/,
  /^src\/kb\/apis\.ts$/,
  /^src\/kb\/api-manifest\.ts$/,
]

const FAILED = new Set(['failure', 'timed_out'])

export function isFailedConclusion (conclusion) {
  return FAILED.has(conclusion)
}

export function firstFailedJob (payload) {
  const jobs = payload?.jobs
  if (!Array.isArray(jobs)) return null
  return jobs.find((job) => job && (isFailedConclusion(job.conclusion) || job.state === 'failed')) ?? null
}

export function jobLogUrl (repo, jobId) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null
  if (jobId == null || jobId === '') return null
  const id = encodeURIComponent(String(jobId))
  if (id !== String(jobId) || /[^0-9]/.test(String(jobId))) return null
  return `https://api.github.com/repos/${repo}/actions/jobs/${id}/logs`
}

export async function downloadJobLog ({ repo, jobId, dest, token, fetchImpl = fetch }) {
  const url = jobLogUrl(repo, jobId)
  if (!url || typeof dest !== 'string' || dest === '' || typeof token !== 'string' || token === '') return false
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'follow',
  })
  if (!res || res.ok !== true) return false
  const text = await res.text()
  writeFileSync(dest, text)
  return text.length > 0
}

export function parseBkBuildUrl (url) {
  if (typeof url !== 'string') return null
  const m = url.match(/^https:\/\/buildkite\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/builds\/(\d+)(?:[/?#]|$)/)
  if (!m) return null
  return { org: m[1], pipeline: m[2], build: m[3] }
}

export async function downloadBkFirstFailure ({ token, org, pipeline, build, fetchImpl = fetch, maxChars = 8000 }) {
  if (typeof token !== 'string' || token === '') return null
  if (typeof org !== 'string' || typeof pipeline !== 'string' || typeof build !== 'string') return null
  if (!/^[A-Za-z0-9_.-]+$/.test(org) || !/^[A-Za-z0-9_.-]+$/.test(pipeline) || !/^\d+$/.test(build)) return null
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const buildRes = await fetchImpl(
    `https://api.buildkite.com/v2/organizations/${org}/pipelines/${pipeline}/builds/${build}`,
    { headers, redirect: 'follow' },
  )
  if (!buildRes || buildRes.ok !== true) return null
  const data = await buildRes.json()
  const job = firstFailedJob({ jobs: data?.jobs })
  if (!job?.id) {
    return {
      jobName: 'functional',
      summary: `${pipeline} #${build} failed`,
      log: '',
    }
  }
  let log = ''
  const logRes = await fetchImpl(
    `https://api.buildkite.com/v2/organizations/${org}/pipelines/${pipeline}/builds/${build}/jobs/${encodeURIComponent(String(job.id))}/log`,
    { headers, redirect: 'follow' },
  )
  if (logRes && logRes.ok === true) {
    const body = await logRes.json()
    if (typeof body?.content === 'string') log = body.content
  }
  const tail = log.split('\n').slice(-80).join('\n').slice(-maxChars)
  return {
    jobName: typeof job.name === 'string' && job.name !== '' ? job.name : 'functional',
    summary: `${job.name ?? pipeline}: FAIL`,
    log: tail,
  }
}

export function hasStopCommand (text) {
  return typeof text === 'string' && /(?:^|[\s])\/stop(?:-repair)?(?:[\s]|$)/m.test(text)
}

export function canonicalPath (file) {
  if (typeof file !== 'string' || file.length === 0) return null
  if (file.includes('\0') || file.includes('\\')) return null
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file)) return null
  const parts = []
  for (const part of file.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') return null
    parts.push(part)
  }
  return parts.length === 0 ? null : parts.join('/')
}

export function isGeneratedPath (file) {
  const n = canonicalPath(file)
  return n !== null && GENERATED.some((re) => re.test(n))
}

function isDirOrChild (n, dir) {
  return n === dir || n.startsWith(`${dir}/`)
}

export function isProtectedWritePath (file) {
  const n = canonicalPath(file)
  return n === null
    || isDirOrChild(n, '.github')
    || isDirOrChild(n, '.git')
    || isDirOrChild(n, '.buildkite')
}

export function isSafeReadPath (file) {
  return canonicalPath(file) !== null
}

export function isSafeWritePath (file) {
  const n = canonicalPath(file)
  return n !== null && !isGeneratedPath(n) && !isProtectedWritePath(n)
}

export function hasBadCommand (text) {
  return typeof text === 'string' && /(?:^|[\s])\/bad(?:[\s]|$)/m.test(text)
}

export const REPAIR_BOT_LOGINS = new Set([
  'github-actions',
  'github-actions[bot]',
  'elastic-vault-github-plugin-prod',
  'elastic-vault-github-plugin-prod[bot]',
])

export function isRepairBotLogin (login) {
  return typeof login === 'string' && REPAIR_BOT_LOGINS.has(login)
}

export function countBotCommits (commits) {
  if (!Array.isArray(commits)) return 0
  return commits.filter((commit) => (
    isRepairBotLogin(commit?.author?.login) || isRepairBotLogin(commit?.commit?.author?.name)
  )).length
}

export function hasBkRepairTag (text) {
  return typeof text === 'string' && text.includes('<!-- bk-repair-loop -->')
}

export function positiveInt (value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER ? value : null
  }
  if (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)) {
    const n = Number(value)
    return n <= Number.MAX_SAFE_INTEGER ? n : null
  }
  return null
}

export function isTrustedAssociation (association) {
  return association === 'OWNER' || association === 'MEMBER'
}

export function parseReviewNoEvent (payload) {
  if (!payload || typeof payload !== 'object') return null
  const source = payload.source
  if (source !== 'issue_comment' && source !== 'pull_request_review_comment') return null
  const commentId = positiveInt(payload.comment_id)
  if (commentId === null) return null
  return {
    source,
    commentId,
    apiPath: source === 'issue_comment'
      ? `issues/comments/${commentId}`
      : `pulls/comments/${commentId}`,
  }
}

export function parseReviewLoopEvent (payload) {
  if (!payload || typeof payload !== 'object') return null
  const pr = positiveInt(payload.pr)
  const reviewId = positiveInt(payload.review_id ?? payload.reviewId)
  if (pr === null || reviewId === null) return null
  return { pr, reviewId }
}

export function resolveReviewLoopPr (artifactPr, runPr) {
  const run = positiveInt(runPr)
  if (run === null) return null
  const artifact = positiveInt(artifactPr)
  if (artifact !== null && artifact !== run) return null
  return run
}

export function reviewCommentPrNumber (comment, source) {
  const url = source === 'issue_comment' ? comment?.issue_url : comment?.pull_request_url
  if (typeof url !== 'string') return null
  const match = url.match(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/(?:issues|pulls)\/([1-9][0-9]{0,15})$/)
  return match ? Number(match[1]) : null
}

export function memoryActionItem (reason) {
  let r = String(reason ?? '').replace(/\s+/g, ' ').trim()
  r = r.replace(/\/bad\b/gi, ' ').replace(/\/review-no\b/gi, ' ').replace(/\s+/g, ' ').trim()
  r = r.replace(/^\d{4}-\d{2}-\d{2}:\s*/, '')
  const pipe = r.indexOf(' | ')
  if (pipe !== -1) r = r.slice(0, pipe).trim()
  r = r.replace(/^[-*]\s+/, '').trim()
  if (!r) return ''
  return `- ${r.slice(0, 280)}`
}

export function memoryEntry (reason, _finding, _day) {
  return memoryActionItem(reason)
}

export const MEMORY_SKILL_PATH = '.github/skills/ai-review-memory.md'
export const MEMORY_CURSOR_RE = /<!-- processed-through:\s*(\d+)\s*-->/

const MEMORY_SKILL_HEADER = `# AI review memory

Shared store for rejected AI review findings. \`/bad\` (OWNER/MEMBER) updates this file on the standing \`ai/review-memory\` PR. Not an issue hop.

Action items for the next AI review. Follow these. Do not repeat the rejected findings.
`

export function isMemoryLine (text) {
  if (typeof text !== 'string') return false
  const line = text.trim().split('\n')[0]
  if (/^Noted\b/i.test(line.replace(/^[-*]\s+/, ''))) return false
  return memoryActionItem(line) !== ''
}

const TRUSTED_ASSOCIATION = new Set(['OWNER', 'MEMBER'])

export function isTrustedMemoryAuthor (comment) {
  const login = comment?.user?.login
  if (login === 'github-actions[bot]') return true
  return TRUSTED_ASSOCIATION.has(comment?.author_association)
}

export function parseMemoryCursor (text) {
  const match = typeof text === 'string' ? text.match(MEMORY_CURSOR_RE) : null
  return match ? Number(match[1]) : 0
}

export function setMemoryCursor (text, cursor) {
  const body = typeof text === 'string' ? text : ''
  const line = `<!-- processed-through: ${Number(cursor) || 0} -->`
  if (MEMORY_CURSOR_RE.test(body)) return body.replace(MEMORY_CURSOR_RE, line)
  if (body.trim() === '') return `${line}\n`
  return `${body.replace(/\s*$/, '')}\n\n${line}\n`
}

export function unprocessedMemoryComments (comments, cursor) {
  const after = Number(cursor) || 0
  if (!Array.isArray(comments)) return []
  return comments
    .filter((item) => {
      const id = Number(item?.id)
      return Number.isFinite(id) && id > after && isMemoryLine(item.body) && isTrustedMemoryAuthor(item)
    })
    .sort((a, b) => Number(a.id) - Number(b.id))
}

export function isSkillOnlyPr (pr) {
  const files = pr?.files
  if (!Array.isArray(files) || files.length === 0) return false
  return files.every((file) => (typeof file === 'string' ? file : file?.path) === MEMORY_SKILL_PATH)
}

export function pickSkillMemoryPr (prs, { defaultBranch } = {}) {
  if (!Array.isArray(prs)) return null
  const usable = (pr) => {
    if (!pr || pr.isCrossRepository) return false
    if (defaultBranch && pr.headRefName === defaultBranch) return false
    const labels = Array.isArray(pr.labels) ? pr.labels : []
    const labeled = labels.some((label) => (typeof label === 'string' ? label : label?.name) === 'ai-review-memory')
    const login = pr.author?.login ?? pr.user?.login
    const bot = login === 'github-actions' || login === 'github-actions[bot]'
    return labeled || bot
  }
  return prs.find((pr) => usable(pr) && pr.headRefName === 'ai/review-memory')
    ?? prs.find((pr) => usable(pr) && isSkillOnlyPr(pr))
    ?? null
}

export function appendMemorySkill (existing, entry) {
  const action = memoryActionItem(entry)
  const raw = typeof existing === 'string' ? existing : ''
  if (!action) return raw
  const have = new Set(raw.split('\n').map((line) => memoryActionItem(line)).filter(Boolean))
  if (have.has(action)) return raw
  const body = raw.trim() === '' ? `${MEMORY_SKILL_HEADER}\n` : raw.replace(/\s*$/, '\n')
  return `${body}${action}\n`
}

export function mergeMemorySkill (existing, comments) {
  const raw = typeof existing === 'string' ? existing : ''
  if (!Array.isArray(comments) || comments.length === 0) return raw
  const have = new Set(raw.split('\n').map((line) => memoryActionItem(line)).filter(Boolean))
  const added = []
  let cursor = parseMemoryCursor(raw)
  for (const item of comments) {
    const id = Number(item?.id) || 0
    if (id > cursor) cursor = id
    const action = memoryActionItem(item?.body)
    if (!action || have.has(action)) continue
    have.add(action)
    added.push(action)
  }
  let body = raw.trim() === '' ? `${MEMORY_SKILL_HEADER}\n<!-- processed-through: 0 -->\n` : raw
  if (added.length > 0) body = body.replace(/\s*$/, '\n') + added.join('\n') + '\n'
  return setMemoryCursor(body, cursor)
}

export function citedPathsFromText (text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const re = /(?:^|[\s`'"(])((?:src|test|scripts|codegen|packages)\/[A-Za-z0-9_./-]+\.(?:ts|js|mjs|yml|yaml|json|md))/g
  const out = new Set()
  let match
  while ((match = re.exec(text)) !== null) {
    const canon = canonicalPath(match[1])
    if (canon) out.add(canon)
  }
  return [...out]
}

export function extractJsonObject (text) {
  if (typeof text !== 'string' || text.length === 0) return null
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function parseAgentResponse (text) {
  const obj = extractJsonObject(text)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('no JSON object')
  }
  const changes = obj.changes ?? []
  if (!Array.isArray(changes)) throw new Error('changes must be an array')
  for (const change of changes) {
    if (!change || typeof change.file !== 'string' || typeof change.content !== 'string') {
      throw new Error('each change needs file and content')
    }
    if (!isSafeWritePath(change.file)) {
      throw new Error(`refusing path: ${change.file}`)
    }
  }
  return {
    stop: obj.stop === true,
    comment: typeof obj.comment === 'string' ? obj.comment : '',
    commit_message: safeCommitMessage(obj.commit_message),
    changes,
  }
}

export function safeCommitMessage (msg) {
  const fallback = 'fix: repair first ci failure'
  if (typeof msg !== 'string' || msg.includes('\n')) return fallback
  return /^(feat|fix|docs|test|ci|refactor|perf|chore|revert)(\([^)]+\))?: [a-z0-9 ].{0,72}$/.test(msg)
    ? msg
    : fallback
}

export function shouldAttemptFix ({
  sameRepo = false,
  skipLoop = false,
  stopRepair = false,
  autoLoop = false,
  botCommits = 0,
  maxBotCommits = 2,
} = {}) {
  if (!sameRepo) return { ok: false, reason: 'fork' }
  if (stopRepair) return { ok: false, reason: 'stop' }
  if (skipLoop) return { ok: false, reason: 'skip-auto-loop' }
  if (!autoLoop) return { ok: false, reason: 'no auto-loop' }
  if (botCommits >= maxBotCommits) return { ok: false, reason: 'bot commit cap' }
  return { ok: true, reason: 'ok' }
}

export function refuseSymlinkChain (root, dest) {
  let cur = dest
  for (;;) {
    try {
      if (lstatSync(cur).isSymbolicLink()) {
        throw new Error(`refusing symlink: ${cur}`)
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
    if (cur === root) return
    const parent = dirname(cur)
    if (parent === cur) return
    cur = parent
  }
}

function posixRel (from, to) {
  const rel = relative(from, to)
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..') return null
  return rel.split(sep).join('/')
}

export function applyChanges (changes, cwd) {
  const root = resolve(cwd)
  for (const change of changes) {
    const relFile = canonicalPath(change.file)
    if (relFile === null || !isSafeWritePath(relFile)) {
      throw new Error(`refusing path: ${change.file}`)
    }
    const dest = resolve(root, ...relFile.split('/'))
    if (posixRel(root, dest) !== relFile) {
      throw new Error(`path escapes cwd: ${change.file}`)
    }
    refuseSymlinkChain(root, dest)
    try {
      const rootReal = realpathSync(root)
      const realDest = resolve(realpathSync(dirname(dest)), basename(dest))
      const relReal = posixRel(rootReal, realDest)
      if (relReal === null || !isSafeWritePath(relReal)) {
        throw new Error(`realpath escapes cwd: ${change.file}`)
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, change.content)
  }
}

export function validatedWrites (changes) {
  if (!Array.isArray(changes)) throw new Error('changes must be an array')
  return changes.map((change) => {
    const relFile = canonicalPath(change?.file)
    if (relFile === null || !isSafeWritePath(relFile)) {
      throw new Error(`refusing path: ${change?.file}`)
    }
    if (typeof change.content !== 'string') throw new Error(`refusing path: ${change.file}`)
    return { path: relFile, content: change.content }
  })
}

export function gitHeadRef (branch) {
  return `heads/${encodeURIComponent(branch)}`
}

export function defaultGhApi (method, path, body) {
  const args = ['api', '-X', method, path]
  if (body !== undefined) {
    const file = join(tmpdir(), `repair-loop-gh-${process.pid}.json`)
    writeFileSync(file, JSON.stringify(body))
    args.push('--input', file)
  }
  const out = execFileSync('gh', args, { encoding: 'utf8' })
  return out ? JSON.parse(out) : {}
}

export function applyChangesGithub (changes, { repo, branch, message, expectedSha, api = defaultGhApi }) {
  if (typeof repo !== 'string' || !repo.includes('/') || typeof branch !== 'string' || branch.length === 0) {
    throw new Error('repo and branch required')
  }
  const files = validatedWrites(changes)
  if (files.length === 0) return
  const head = gitHeadRef(branch)
  const ref = api('GET', `repos/${repo}/git/ref/${head}`)
  if (expectedSha && ref.object.sha !== expectedSha) {
    throw new Error(`branch moved: ${ref.object.sha} != ${expectedSha}`)
  }
  const parent = api('GET', `repos/${repo}/git/commits/${ref.object.sha}`)
  const tree = files.map((file) => {
    const blob = api('POST', `repos/${repo}/git/blobs`, { content: file.content, encoding: 'utf-8' })
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha }
  })
  const newTree = api('POST', `repos/${repo}/git/trees`, { base_tree: parent.tree.sha, tree })
  const commit = api('POST', `repos/${repo}/git/commits`, {
    message: safeCommitMessage(message),
    tree: newTree.sha,
    parents: [ref.object.sha],
  })
  api('PATCH', `repos/${repo}/git/refs/${head}`, { sha: commit.sha })
}

function readJsonArg (path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function main (argv) {
  const [cmd, ...args] = argv
  switch (cmd) {
    case 'fetch-job-log': {
      const ok = await downloadJobLog({
        repo: process.env.GH_REPO,
        jobId: args[0],
        dest: args[1],
        token: process.env.GH_TOKEN,
      })
      process.exit(ok ? 0 : 1)
      break
    }
    case 'fetch-bk-failure': {
      const parsed = parseBkBuildUrl(args[0])
      const result = parsed
        ? await downloadBkFirstFailure({
          ...parsed,
          token: process.env.BUILDKITE_API_TOKEN,
        })
        : null
      writeFileSync(args[1], JSON.stringify(result ?? {}))
      process.exit(result ? 0 : 1)
      break
    }
    case 'first-failure': {
      const job = firstFailedJob(readJsonArg(args[0]))
      process.stdout.write(JSON.stringify(job) + '\n')
      process.exit(job ? 0 : 2)
      break
    }
    case 'has-bad': {
      const found = hasBadCommand(readFileSync(args[0], 'utf8'))
      process.stdout.write(JSON.stringify({ bad: found }) + '\n')
      process.exit(found ? 0 : 1)
      break
    }
    case 'review-no-event': {
      const parsed = parseReviewNoEvent(readJsonArg(args[0]))
      process.stdout.write(JSON.stringify(parsed ?? {}) + '\n')
      process.exit(parsed ? 0 : 1)
      break
    }
    case 'review-loop-event': {
      const parsed = parseReviewLoopEvent(readJsonArg(args[0]))
      process.stdout.write(JSON.stringify(parsed ?? {}) + '\n')
      process.exit(parsed ? 0 : 1)
      break
    }
    case 'review-loop-pr': {
      const parsed = parseReviewLoopEvent(readJsonArg(args[0]))
      const pr = parsed ? resolveReviewLoopPr(parsed.pr, args[1]) : null
      process.stdout.write(JSON.stringify(pr ? { pr, reviewId: parsed.reviewId } : {}) + '\n')
      process.exit(pr ? 0 : 1)
      break
    }
    case 'review-comment-pr': {
      const source = args[0]
      const comment = readJsonArg(args[1])
      const pr = reviewCommentPrNumber(comment, source)
      process.stdout.write(JSON.stringify({ pr }) + '\n')
      process.exit(pr ? 0 : 1)
      break
    }
    case 'memory-entry': {
      const reason = args[0] ?? ''
      const finding = args[1] ?? ''
      const day = args[2] ?? new Date().toISOString().slice(0, 10)
      process.stdout.write(memoryEntry(reason, finding, day) + '\n')
      break
    }
    case 'memory-cursor': {
      process.stdout.write(String(parseMemoryCursor(readFileSync(args[0], 'utf8'))) + '\n')
      break
    }
    case 'memory-set-cursor': {
      process.stdout.write(setMemoryCursor(readFileSync(args[0], 'utf8'), Number(args[1])))
      break
    }
    case 'pick-skill-pr': {
      const pr = pickSkillMemoryPr(readJsonArg(args[0]), { defaultBranch: process.env.DEFAULT_BRANCH })
      process.stdout.write(JSON.stringify(pr ? { number: pr.number, headRefName: pr.headRefName } : {}) + '\n')
      process.exit(pr ? 0 : 1)
      break
    }
    case 'memory-append': {
      process.stdout.write(appendMemorySkill(readFileSync(args[0], 'utf8'), args[1] ?? ''))
      break
    }
    case 'memory-merge': {
      const existing = readFileSync(args[0], 'utf8')
      const comments = readJsonArg(args[1])
      const issueCursor = args[2] ? parseMemoryCursor(readFileSync(args[2], 'utf8')) : 0
      const cursor = Math.max(parseMemoryCursor(existing), issueCursor)
      process.stdout.write(mergeMemorySkill(existing, unprocessedMemoryComments(comments, cursor)))
      break
    }
    case 'bot-commits': {
      const raw = readFileSync(args[0], 'utf8').trim()
      let commits = []
      if (raw.startsWith('[')) commits = JSON.parse(raw)
      else if (raw !== '') commits = raw.split('\n').map((line) => JSON.parse(line))
      process.stdout.write(String(countBotCommits(commits)) + '\n')
      break
    }
    case 'has-bk-tag': {
      const found = hasBkRepairTag(readFileSync(args[0], 'utf8'))
      process.stdout.write(JSON.stringify({ bk: found }) + '\n')
      process.exit(found ? 0 : 1)
      break
    }
    case 'has-stop': {
      const found = hasStopCommand(readFileSync(args[0], 'utf8'))
      process.stdout.write(JSON.stringify({ stop: found }) + '\n')
      process.exit(found ? 0 : 1)
      break
    }
    case 'cited-paths': {
      const text = readFileSync(args[0], 'utf8')
      process.stdout.write(JSON.stringify(citedPathsFromText(text)) + '\n')
      break
    }
    case 'should-fix': {
      const decision = shouldAttemptFix({
        sameRepo: process.env.SAME_REPO === '1',
        skipLoop: process.env.SKIP_LOOP === '1',
        stopRepair: process.env.STOP_REPAIR === '1',
        autoLoop: process.env.AUTO_LOOP === '1',
        botCommits: Number(process.env.BOT_COMMITS || '0'),
      })
      process.stdout.write(JSON.stringify(decision) + '\n')
      process.exit(decision.ok ? 0 : 1)
      break
    }
    case 'parse-changes': {
      const parsed = parseAgentResponse(readFileSync(args[0], 'utf8'))
      process.stdout.write(JSON.stringify(parsed) + '\n')
      break
    }
    case 'apply-changes': {
      const parsed = readJsonArg(args[0])
      applyChanges(parsed.changes ?? [], args[1] ?? process.cwd())
      break
    }
    case 'apply-github': {
      const parsed = readJsonArg(args[0])
      applyChangesGithub(parsed.changes ?? [], {
        repo: process.env.GH_REPO,
        branch: process.env.BRANCH,
        expectedSha: process.env.EXPECTED_SHA,
        message: parsed.commit_message,
      })
      break
    }
    default:
      process.stderr.write(`unknown command: ${cmd ?? ''}\n`)
      process.exit(2)
  }
}

const entry = process.argv[1]
if (entry != null && import.meta.url === pathToFileURL(resolve(entry)).href) {
  Promise.resolve(main(process.argv.slice(2))).catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + '\n')
    process.exit(1)
  })
}
