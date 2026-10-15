/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { access, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSniffDue, sniffIfDue, SNIFF_RETRY_MS, SNIFF_TTL_MS } from '../../src/config/sniff.ts'
import { scanEarlyHints, scanEarlySniffState } from '../../src/config/early-scan.ts'
import { sniffVersion } from '../../src/status/checks.ts'
import { parseVersionHint } from '../../src/lib/availability.ts'
import { ContextSchema } from '../../src/config/schema.ts'
import { clearConfigCache } from '../../src/config/loader.ts'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; clearConfigCache() })

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

/** Stubs fetch; records every request. */
function stubFetch (handler: (url: string, init: RequestInit) => Response): Array<{ url: string, init: RequestInit }> {
  const calls: Array<{ url: string, init: RequestInit }> = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return calls
}

/** Runs `fn` with stderr captured; returns every chunk written. */
async function captureStderr (fn: () => Promise<unknown>): Promise<string[]> {
  const writes: string[] = []
  const orig = process.stderr.write
  process.stderr.write = ((s: string) => { writes.push(s); return true }) as typeof process.stderr.write
  try { await fn() } finally { process.stderr.write = orig }
  return writes
}

async function tmpConfig (text: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'sniff-')), 'config.yml')
  await writeFile(path, text)
  return path
}

const NOW = Date.parse('2026-10-13T00:00:00Z')
const fresh = new Date(NOW - 1000).toISOString()
const stale = new Date(NOW - SNIFF_TTL_MS - 1000).toISOString()

describe('isSniffDue', () => {
  it('is due without a version', () => assert.equal(isSniffDue({}, NOW), true))
  it('is never due for a pinned plain string', () => assert.equal(isSniffDue({ version: '9.1' }, NOW), false))
  it('is not due for a fresh detected version', () => assert.equal(isSniffDue({ version: '9.1', checkedTs: fresh }, NOW), false))
  it('is due for a detected version older than 30 days', () => assert.equal(isSniffDue({ version: '9.1', checkedTs: stale }, NOW), true))
  it('is due for an unparseable timestamp', () => assert.equal(isSniffDue({ version: '9.1', checkedTs: 'nope' }, NOW), true))
  it('is not due within the retry window after a failed sniff', () => assert.equal(isSniffDue({ checkedTs: fresh }, NOW), false))
  it('is due after the retry window after a failed sniff', () => assert.equal(isSniffDue({ checkedTs: new Date(NOW - SNIFF_RETRY_MS - 1000).toISOString() }, NOW), true))
})

describe('version object form', () => {
  const text = `current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: http://x\n      version:\n        value: 9.2.3\n        checked_ts: ${fresh}\n`
  it('early scan reads the nested value as a hint and the timestamp as state', () => {
    assert.deepEqual(scanEarlyHints(text), { elasticsearch: '9.2.3' })
    assert.deepEqual(scanEarlySniffState(text), { detectVersion: true, elasticsearch: { version: '9.2.3', checkedTs: fresh } })
  })
  it('early scan reports detect_version: false and services without a version', () => {
    const t = 'detect_version: false\ncurrent_context: a\ncontexts:\n  a:\n    kibana:\n      url: http://x\n'
    assert.deepEqual(scanEarlySniffState(t), { detectVersion: false, kibana: {} })
  })
  it('early scan reads a failed-sniff marker (checked_ts without value)', () => {
    const t = `current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: http://x\n      version:\n        checked_ts: ${fresh}\n`
    assert.deepEqual(scanEarlyHints(t), {})
    assert.deepEqual(scanEarlySniffState(t), { detectVersion: true, elasticsearch: { checkedTs: fresh } })
  })
  it('parseVersionHint ignores a failed-sniff marker', () => assert.equal(parseVersionHint({ checked_ts: fresh }), undefined))
  it('parseVersionHint unwraps { value }', () => assert.deepEqual(parseVersionHint({ value: '9.2.3', checked_ts: fresh }), [9, 2]))
  it('schema accepts the object form and rejects a bad timestamp', () => {
    const ok = ContextSchema.safeParse({ elasticsearch: { url: 'http://x', version: { value: 'serverless', checked_ts: fresh } } })
    assert.equal(ok.success, true)
    const bad = ContextSchema.safeParse({ elasticsearch: { url: 'http://x', version: { value: '9.2', checked_ts: 'nope' } } })
    assert.equal(bad.success, false)
  })
  it('schema accepts a failed-sniff marker (checked_ts without value)', () => {
    const r = ContextSchema.safeParse({ elasticsearch: { url: 'http://x', version: { checked_ts: fresh } } })
    assert.equal(r.success, true)
  })
})

describe('sniffVersion', () => {
  const block = { url: 'http://es:9200/', auth: { api_key: 'k' } }
  it('reads Elasticsearch GET / with redirect: error and strips prerelease', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3-SNAPSHOT' } }))
    assert.deepEqual(await sniffVersion('elasticsearch', block), { ok: true, value: '9.2.3' })
    assert.equal(calls[0]?.url, 'http://es:9200/')
    assert.equal(calls[0]?.init.redirect, 'error')
    assert.equal(calls[0]?.init.method, 'GET')
  })
  it('reads Kibana GET /api/status', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.1.0' } }))
    assert.deepEqual(await sniffVersion('kibana', block), { ok: true, value: '9.1.0' })
    assert.equal(calls[0]?.url, 'http://es:9200/api/status')
  })
  it('detects serverless', async () => {
    stubFetch(() => json({ version: { number: '9.4.0', build_flavor: 'serverless' } }))
    assert.deepEqual(await sniffVersion('elasticsearch', block), { ok: true, value: 'serverless' })
  })
  it('classifies 401 and unparseable responses', async () => {
    stubFetch(() => json({}, 401))
    assert.equal((await sniffVersion('elasticsearch', block)).ok, false)
    stubFetch(() => json({ version: {} }))
    assert.deepEqual(await sniffVersion('elasticsearch', block), { ok: false, error: 'unexpected response' })
  })
  it('fails open when the response body cannot be read', async () => {
    const body = new ReadableStream({ start (c) { c.error(new Error('socket hang up')) } })
    stubFetch(() => new Response(body, { status: 200 }))
    assert.deepEqual(await sniffVersion('elasticsearch', block), { ok: false, error: 'network error: socket hang up' })
  })
})

describe('sniffIfDue', () => {
  const base = (extra: string): string =>
    `# my config\ncurrent_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: http://es:9200 # prod\n      auth:\n        api_key: k\n${extra}`

  it('detects a missing version, writes it, and preserves comments', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3' } }))
    const path = await tmpConfig(base(''))
    await sniffIfDue({ path, json: false, explicitPath: true })
    const out = await readFile(path, 'utf8')
    assert.equal(calls.length, 1)
    assert.match(out, /# my config/)
    assert.match(out, /url: http:\/\/es:9200 # prod/)
    assert.match(out, /version:\n\s+value: 9\.2\.3\n\s+checked_ts: \d{4}-/)
  })

  it('never touches a pinned version, even when stale-looking', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.9.9' } }))
    const text = base('      version: "9.1"\n')
    const path = await tmpConfig(text)
    await sniffIfDue({ path, json: false, explicitPath: true })
    assert.equal(calls.length, 0)
    assert.equal(await readFile(path, 'utf8'), text)
  })

  it('skips a fresh detected version and refreshes an expired one', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.3.0' } }))
    const entry = (ts: string): string => base(`      version:\n        value: 9.1.0\n        checked_ts: ${ts}\n`)
    const freshPath = await tmpConfig(entry(new Date().toISOString()))
    await sniffIfDue({ path: freshPath, json: false, explicitPath: true })
    assert.equal(calls.length, 0)
    const stalePath = await tmpConfig(entry(new Date(Date.now() - SNIFF_TTL_MS - 60_000).toISOString()))
    await sniffIfDue({ path: stalePath, json: false, explicitPath: true })
    assert.equal(calls.length, 1)
    assert.match(await readFile(stalePath, 'utf8'), /value: 9\.3\.0/)
  })

  it('does nothing when detect_version is false', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3' } }))
    const text = 'detect_version: false\n' + base('')
    const path = await tmpConfig(text)
    await sniffIfDue({ path, json: false, explicitPath: true })
    assert.equal(calls.length, 0)
    assert.equal(await readFile(path, 'utf8'), text)
  })

  it('does not sniff a read-only config file', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3' } }))
    const path = await tmpConfig(base(''))
    await chmod(path, 0o444)
    await sniffIfDue({ path, json: false, explicitPath: true })
    assert.equal(calls.length, 0)
  })

  it('works for configs the fast scanner rejects (commands policy)', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3' } }))
    const path = await tmpConfig(base('') + 'commands:\n  profile: default\n')
    await sniffIfDue({ path, json: false, explicitPath: true })
    assert.equal(calls.length, 1)
    assert.match(await readFile(path, 'utf8'), /value: 9\.2\.3/)
  })

  it('fails open on 401: warns once, records the attempt without a value', async () => {
    stubFetch(() => json({}, 401))
    const path = await tmpConfig(base(''))
    const writes = await captureStderr(() => sniffIfDue({ path, json: false, explicitPath: true }))
    assert.equal(writes.length, 1)
    assert.match(writes[0]!, /warning: could not detect elasticsearch version.*continuing without version filtering/)
    const out = await readFile(path, 'utf8')
    assert.match(out, /version:\n\s+checked_ts: \d{4}-/)
    assert.doesNotMatch(out, /value:/)
  })

  it('does not retry a failed sniff within the retry window', async () => {
    const calls = stubFetch(() => json({}, 401))
    const path = await tmpConfig(base(''))
    await captureStderr(() => sniffIfDue({ path, json: false, explicitPath: true }))
    await captureStderr(() => sniffIfDue({ path, json: false, explicitPath: true }))
    assert.equal(calls.length, 1)
  })

  it('keeps the last detected value when a refresh fails', async () => {
    stubFetch(() => json({}, 401))
    const stale = new Date(Date.now() - SNIFF_TTL_MS - 60_000).toISOString()
    const path = await tmpConfig(base(`      version:\n        value: 9.1.0\n        checked_ts: ${stale}\n`))
    const writes = await captureStderr(() => sniffIfDue({ path, json: false, explicitPath: true }))
    assert.match(writes[0]!, /using last detected version 9\.1\.0/)
    const out = await readFile(path, 'utf8')
    assert.match(out, /value: 9\.1\.0/)
    assert.doesNotMatch(out, new RegExp(stale))
  })

  it('suppresses the warning with --json', async () => {
    stubFetch(() => json({}, 404))
    const path = await tmpConfig(base(''))
    const writes = await captureStderr(() => sniffIfDue({ path, json: true, explicitPath: true }))
    assert.deepEqual(writes, [])
  })

  it('does not resolve secrets when no sniff is due', async () => {
    stubFetch(() => json({}))
    const dir = await mkdtemp(join(tmpdir(), 'sniff-'))
    const marker = join(dir, 'resolved')
    const script = join(dir, 'secret.js')
    await writeFile(script, `require("fs").writeFileSync(${JSON.stringify(marker)}, "")`)
    const text = base('      version: "9.1"\n').replace('api_key: k', `api_key: "$(cmd:node ${script.replace(/\\/g, '/')})"`)
    const path = await tmpConfig(text)
    await sniffIfDue({ path, json: false, explicitPath: true })
    await assert.rejects(access(marker))
  })

  it('fails open when the service block is a YAML alias it cannot edit', async () => {
    const calls = stubFetch(() => json({ version: { number: '9.2.3' } }))
    const text = 'current_context: a\ncontexts:\n  b:\n    elasticsearch: &es\n      url: http://es:9200\n  a:\n    elasticsearch: *es\n'
    const path = await tmpConfig(text)
    const writes = await captureStderr(() => sniffIfDue({ path, json: false, explicitPath: true }))
    assert.equal(calls.length, 1)
    assert.match(writes.join(''), /warning: could not save detected versions/)
    assert.equal(await readFile(path, 'utf8'), text)
  })
})
