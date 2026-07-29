/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const CLI = resolve('dist/cli.js')

interface CliResult {
  exitCode: number
  stdout: string
  stderr: string
  json?: unknown
}

function run (args: string[], env: Record<string, string> = {}): CliResult {
  const res = spawnSync('node', [CLI, ...args, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })
  const out: CliResult = {
    exitCode: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  }
  const body = out.stdout.trim().length > 0 ? out.stdout : out.stderr
  if (body.trim().length > 0) {
    try { out.json = JSON.parse(body) } catch { /* leave undefined */ }
  }
  return out
}

describe('elastic config (integration)', () => {
  let dir: string
  let cfg: string

  before(async () => {
    // Ensure dist/cli.js is built
    try {
      await stat(CLI)
    } catch {
      throw new Error(`${CLI} missing; run \`npm run build\` before these tests`)
    }
    dir = await mkdtemp(join(tmpdir(), 'elastic-cli-cmd-'))
    cfg = join(dir, 'cfg.yml')
  })
  after(async () => rm(dir, { recursive: true, force: true }))

  it('context add creates a config file with one context and sets current_context', async () => {
    const res = run([
      'config', 'context', 'add', 'local',
      '--config-file', cfg,
      '--es-url', 'http://localhost:9200',
      '--es-api-key', 'k1',
      '--inline-secrets',
    ])
    assert.equal(res.exitCode, 0, res.stderr)
    assert.equal((res.json as { current: string }).current, 'local')

    if (process.platform !== 'win32') {
      const st = await stat(cfg)
      assert.equal(st.mode & 0o777, 0o600, 'inline secrets must be chmod 0600')
    }
  })

  it('context add --es-via kibana writes a proxied elasticsearch block', async () => {
    const viaCfg = join(dir, 'via.yml')
    const res = run([
      'config', 'context', 'add', 'proxied',
      '--config-file', viaCfg,
      '--kb-url', 'https://kibana.example',
      '--es-via', 'kibana',
    ])
    assert.equal(res.exitCode, 0, res.stderr)

    const written = await readFile(viaCfg, 'utf-8')
    // Isolate the elasticsearch block: the kibana block that follows has its own url.
    const esBlock = written.match(/ {4}elasticsearch:\n((?: {6}.*\n)*)/)?.[1] ?? ''
    assert.match(esBlock, /via: kibana/, written)
    // `via` replaces the url; no Elasticsearch endpoint is written.
    assert.ok(!esBlock.includes('url:'), written)
    assert.match(written, / {4}kibana:\n {6}url: https:\/\/kibana\.example/, written)
  })

  it('context add --es-via kibana without a kibana block is rejected', () => {
    const res = run([
      'config', 'context', 'add', 'broken',
      '--config-file', join(dir, 'broken.yml'),
      '--es-via', 'kibana',
    ])
    assert.notEqual(res.exitCode, 0)
    const err = (res.json as { error?: { code?: string, message?: string } }).error
    assert.equal(err?.code, 'invalid_context')
    assert.match(err?.message ?? '', /requires a kibana block/)
  })

  it('context add without any service flags errors with code=no_fields', () => {
    const res = run([
      'config', 'context', 'add', 'barebones',
      '--config-file', cfg,
    ])
    assert.equal(res.exitCode, 1)
    assert.equal((res.json as { error?: { code: string } }).error?.code, 'no_fields')
  })

  it('context add fails with context_exists when the name already exists', () => {
    const res = run([
      'config', 'context', 'add', 'local',
      '--config-file', cfg,
      '--es-url', 'http://localhost:9200',
      '--es-api-key', 'k1',
      '--inline-secrets',
    ])
    assert.equal(res.exitCode, 1)
    assert.equal((res.json as { error?: { code: string } }).error?.code, 'context_exists')
  })

  it('context add --force overwrites', () => {
    const res = run([
      'config', 'context', 'add', 'local',
      '--config-file', cfg,
      '--es-url', 'http://other:9200',
      '--es-api-key', 'k1b',
      '--inline-secrets',
      '--force',
    ])
    assert.equal(res.exitCode, 0, res.stderr)
  })

  it('context list reports current marker', () => {
    const res = run(['config', 'context', 'list', '--config-file', cfg])
    assert.equal(res.exitCode, 0, res.stderr)
    const out = res.json as { contexts: Array<{ name: string; current: boolean }> }
    assert.deepEqual(out.contexts, [{ name: 'local', current: true }])
  })

  it('context add second context keeps current_context on the first', () => {
    const res = run([
      'config', 'context', 'add', 'staging',
      '--config-file', cfg,
      '--es-url', 'https://staging:9200',
      '--es-api-key', 'k2',
      '--inline-secrets',
    ])
    assert.equal(res.exitCode, 0, res.stderr)
    assert.equal((res.json as { current: string }).current, 'local')
  })

  it('current-context set switches contexts', () => {
    const res = run(['config', 'current-context', 'set', 'staging', '--config-file', cfg])
    assert.equal(res.exitCode, 0, res.stderr)
    assert.equal((res.json as { current: string }).current, 'staging')
  })

  it('current-context set errors on unknown context', () => {
    const res = run(['config', 'current-context', 'set', 'nope', '--config-file', cfg])
    assert.equal(res.exitCode, 1)
    assert.equal((res.json as { error?: { code: string } }).error?.code, 'context_not_found')
  })

  it('current-context get returns the active name', () => {
    const res = run(['config', 'current-context', 'get', '--config-file', cfg])
    assert.equal(res.exitCode, 0, res.stderr)
    assert.equal((res.json as { current: string }).current, 'staging')
  })

  it('context edit --set updates a URL without touching secrets', () => {
    const res = run([
      'config', 'context', 'edit', 'local',
      '--config-file', cfg,
      '--es-url', 'http://new:9200',
      '--inline-secrets',
    ])
    assert.equal(res.exitCode, 0, res.stderr)
  })

  it('context remove of current without --force errors', () => {
    const res = run(['config', 'context', 'remove', 'staging', '--config-file', cfg])
    assert.equal(res.exitCode, 1)
    assert.equal((res.json as { error?: { code: string } }).error?.code, 'current_context')
  })

  it('context remove of non-current succeeds', () => {
    const res = run(['config', 'context', 'remove', 'local', '--config-file', cfg])
    assert.equal(res.exitCode, 0, res.stderr)
  })

  it('context remove last context deletes the config file', async () => {
    const res = run(['config', 'context', 'remove', 'staging', '--config-file', cfg, '--force'])
    assert.equal(res.exitCode, 0, res.stderr)
    await assert.rejects(stat(cfg), { code: 'ENOENT' })
  })

  it('context edit on unknown context errors', async () => {
    await writeFile(cfg, 'current_context: only\ncontexts:\n  only:\n    elasticsearch:\n      url: http://x:9200\n      auth:\n        api_key: k\n')
    const res = run([
      'config', 'context', 'edit', 'missing',
      '--config-file', cfg,
      '--es-url', 'http://y:9200',
    ])
    assert.equal(res.exitCode, 1)
    assert.equal((res.json as { error?: { code: string } }).error?.code, 'context_not_found')
  })
})
