#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, normalize, relative, resolve } from 'node:path'
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

export function isGeneratedPath (file) {
  return GENERATED.some((re) => re.test(posixPath(file)))
}

export function isProtectedWritePath (file) {
  const n = posixPath(file)
  return n.startsWith('.github/workflows/') || n.startsWith('.git/')
}

export function isSafeReadPath (file) {
  if (typeof file !== 'string' || file.length === 0) return false
  if (file.startsWith('/') || file.includes('\0') || file.includes('\\')) return false
  if (file.includes('..') || /^[A-Za-z]:/.test(file)) return false
  const normalized = normalize(file)
  return !normalized.startsWith('..') && normalized !== '..'
}

export function isSafeWritePath (file) {
  return isSafeReadPath(file) && !isGeneratedPath(file) && !isProtectedWritePath(file)
}

export function citedPathsFromText (text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const re = /(?:^|[\s`'"(])((?:src|test|scripts|codegen|packages)\/[A-Za-z0-9_./-]+\.(?:ts|js|mjs|yml|yaml|json|md))/g
  const out = new Set()
  let match
  while ((match = re.exec(text)) !== null) {
    if (isSafeReadPath(match[1])) out.add(match[1])
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

export function applyChanges (changes, cwd) {
  const root = resolve(cwd)
  for (const change of changes) {
    if (!isSafeWritePath(change.file)) {
      throw new Error(`refusing path: ${change.file}`)
    }
    const dest = resolve(root, change.file)
    const rel = relative(root, dest)
    if (rel.startsWith('..') || rel === '' || (!dest.startsWith(root + '/') && dest !== root)) {
      throw new Error(`path escapes cwd: ${change.file}`)
    }
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, change.content)
  }
}

function posixPath (file) {
  return file.replaceAll('\\', '/')
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
