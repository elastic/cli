#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
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

export function hasStopCommand (text) {
  return typeof text === 'string' && /(?:^|[\s])\/stop-repair(?:[\s]|$)/m.test(text)
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

export function isProtectedWritePath (file) {
  const n = canonicalPath(file)
  return n === null || n.startsWith('.github/workflows/') || n.startsWith('.git/')
}

export function isSafeReadPath (file) {
  return canonicalPath(file) !== null
}

export function isSafeWritePath (file) {
  const n = canonicalPath(file)
  return n !== null && !isGeneratedPath(n) && !isProtectedWritePath(n)
}

export function hasReviewNoCommand (text) {
  return typeof text === 'string' && /(?:^|[\s])\/review-no(?:[\s]|$)/m.test(text)
}

export function memoryActionItem (reason) {
  let r = String(reason ?? '').replace(/\s+/g, ' ').trim()
  r = r.replace(/\/review-no\b/gi, ' ').replace(/\s+/g, ' ').trim()
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

Action items for the next AI review. Follow these. Do not repeat the rejected findings.
`

export function isMemoryLine (text) {
  if (typeof text !== 'string') return false
  const line = text.trim().split('\n')[0]
  if (/^Noted\b/i.test(line.replace(/^[-*]\s+/, ''))) return false
  return memoryActionItem(line) !== ''
}

const TRUSTED_ASSOCIATION = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

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
  if (stopRepair) return { ok: false, reason: 'stop-repair' }
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

export function applyChanges (changes, cwd) {
  const root = resolve(cwd)
  for (const change of changes) {
    const relFile = canonicalPath(change.file)
    if (relFile === null || !isSafeWritePath(relFile)) {
      throw new Error(`refusing path: ${change.file}`)
    }
    const dest = resolve(root, relFile)
    const rel = relative(root, dest)
    if (rel.startsWith('..') || rel === '' || (!dest.startsWith(root + '/') && dest !== root)) {
      throw new Error(`path escapes cwd: ${change.file}`)
    }
    refuseSymlinkChain(root, dest)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, change.content)
  }
}

function readJsonArg (path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main (argv) {
  const [cmd, ...args] = argv
  switch (cmd) {
    case 'first-failure': {
      const job = firstFailedJob(readJsonArg(args[0]))
      process.stdout.write(JSON.stringify(job) + '\n')
      process.exit(job ? 0 : 2)
      break
    }
    case 'has-review-no': {
      const found = hasReviewNoCommand(readFileSync(args[0], 'utf8'))
      process.stdout.write(JSON.stringify({ reviewNo: found }) + '\n')
      process.exit(found ? 0 : 1)
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
    case 'memory-merge': {
      const existing = readFileSync(args[0], 'utf8')
      const comments = readJsonArg(args[1])
      const issueCursor = args[2] ? parseMemoryCursor(readFileSync(args[2], 'utf8')) : 0
      const cursor = Math.max(parseMemoryCursor(existing), issueCursor)
      process.stdout.write(mergeMemorySkill(existing, unprocessedMemoryComments(comments, cursor)))
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
    default:
      process.stderr.write(`unknown command: ${cmd ?? ''}\n`)
      process.exit(2)
  }
}

const entry = process.argv[1]
if (entry != null && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main(process.argv.slice(2))
}
