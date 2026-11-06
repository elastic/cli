/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'

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

  it('context add emits a stderr warning when a secret flag is supplied', async () => {
    await writeFile(cfg, 'current_context: only\ncontexts:\n  only:\n    elasticsearch:\n      url: http://x:9200\n      auth:\n        api_key: k\n')
    const res = run([
      'config', 'context', 'add', 'withsecret',
      '--config-file', cfg,
      '--es-url', 'http://localhost:9200',
      '--es-api-key', 'supersecret',
      '--inline-secrets',
    ])
    assert.ok(res.stderr.includes('Warning:'), 'expected a Warning on stderr')
    assert.ok(res.stderr.includes('--es-api-key'), 'expected --es-api-key in the warning')
    assert.ok(res.stderr.includes('process listings'), 'expected visibility warning text')
  })

  it('context add does not emit a stderr warning when no secret flag is supplied', async () => {
    await writeFile(cfg, 'current_context: only\ncontexts:\n  only:\n    elasticsearch:\n      url: http://x:9200\n      auth:\n        api_key: k\n')
    const res = run([
      'config', 'context', 'add', 'nosecret',
      '--config-file', cfg,
      '--es-url', 'http://localhost:9200',
    ])
    const secretWarning = res.stderr.split('\n').filter(l => l.startsWith('Warning:') && l.includes('process listings'))
    assert.equal(secretWarning.length, 0, 'expected no secret-flag warning on stderr')
  })
})

describe('elastic config context add (home config discovery)', () => {
  let home: string

  before(async () => { home = await mkdtemp(join(tmpdir(), 'elastic-cli-home-write-')) })
  after(async () => rm(home, { recursive: true, force: true }))

  const homeEnv = () => ({ HOME: home, USERPROFILE: home, ELASTIC_CLI_CONFIG_FILE: '' })

  for (const name of ['.elasticrc', '.elasticrc.json', '.elasticrc.yaml']) {
    it(`writes to the existing ~/${name} and creates no ~/.elasticrc.yml (#727)`, async () => {
      const existing = join(home, name)
      await writeFile(existing, JSON.stringify({ current_context: 'a', contexts: { a: { elasticsearch: { url: 'http://a:9200' } } } }))
      try {
        const res = run(['config', 'context', 'add', 'b', '--es-url', 'http://b:9200'], homeEnv())
        assert.equal(res.exitCode, 0, res.stderr)
        const written = await readFile(existing, 'utf-8')
        assert.match(written, /http:\/\/b:9200/)
        if (name.endsWith('.json')) JSON.parse(written)
        await assert.rejects(stat(join(home, '.elasticrc.yml')), { code: 'ENOENT' })
        const list = run(['config', 'context', 'list'], homeEnv())
        assert.deepEqual((list.json as { contexts: Array<{ name: string }> }).contexts.map(c => c.name), ['a', 'b'])
      } finally {
        await rm(existing, { force: true })
      }
    })
  }

  it('creates ~/.elasticrc.yml when no config file exists', async () => {
    const res = run(['config', 'context', 'add', 'fresh', '--es-url', 'http://f:9200'], homeEnv())
    assert.equal(res.exitCode, 0, res.stderr)
    assert.match(await readFile(join(home, '.elasticrc.yml'), 'utf-8'), /fresh/)
    await rm(join(home, '.elasticrc.yml'))
  })
})

describe('elastic config secret store fallback', { skip: process.platform !== 'linux' }, () => {
  async function binDir (passVersionStatus: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-secret-bin-'))
    await writeFile(join(dir, 'secret-tool'), '#!/bin/sh\nif [ "$1" = "store" ]; then exit 1; fi\nexit 2\n')
    await writeFile(join(dir, 'pass'), `#!/bin/sh\nif [ "$1" = "version" ]; then exit ${passVersionStatus}; fi\nif [ "$1" = "insert" ]; then exit 0; fi\nexit 1\n`)
    await chmod(join(dir, 'secret-tool'), 0o755)
    await chmod(join(dir, 'pass'), 0o755)
    return dir
  }

  async function addWith (bin: string, name: string, apiKey: string) {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-secret-cfg-'))
    const cfg = join(dir, 'cfg.yml')
    const res = run(
      ['config', 'context', 'add', name, '--config-file', cfg, '--es-url', 'http://localhost:9200', '--es-api-key', apiKey],
      { PATH: `${bin}:${process.env.PATH ?? ''}` }
    )
    return { dir, cfg, res }
  }

  it('falls through to pass when secret-tool rejects the write', async () => {
    const bin = await binDir('0')
    const apiKey = 'hunter2?#'
    const { dir, cfg, res } = await addWith(bin, 'linsec', apiKey)
    try {
      assert.equal(res.exitCode, 0, res.stderr)
      const secrets = (res.json as { secrets: Array<{ path: string, storage: string }> }).secrets
      assert.deepEqual(secrets, [{ path: 'elasticsearch.auth.api_key', storage: 'pass' }])
      const yaml = await readFile(cfg, 'utf-8')
      const parsed = parseYaml(yaml) as { contexts: Record<string, { elasticsearch: { auth: { api_key: string } } }> }
      assert.equal(parsed.contexts.linsec.elasticsearch.auth.api_key, '$(pass:elastic-cli/linsec:elasticsearch.auth.api_key)')
      assert.equal(yaml.includes(apiKey), false)
      const noStore = res.stderr.split('\n').filter(l => l.includes('No OS secret store'))
      assert.equal(noStore.length, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(bin, { recursive: true, force: true })
    }
  })

  it('writes the secret inline when secret-tool and pass both reject it', async () => {
    const bin = await binDir('1')
    const apiKey = 'hunter2?#'
    const { dir, cfg, res } = await addWith(bin, 'nosec', apiKey)
    try {
      assert.equal(res.exitCode, 0, res.stderr)
      const body = res.json as { secrets: Array<{ path: string, storage: string }>, warnings: string[] }
      assert.deepEqual(body.secrets, [{ path: 'elasticsearch.auth.api_key', storage: 'inline' }])
      const noStore = body.warnings.filter(w => w.startsWith('No OS secret store'))
      assert.equal(noStore.length, 1)
      const yaml = await readFile(cfg, 'utf-8')
      const parsed = parseYaml(yaml) as { contexts: Record<string, { elasticsearch: { auth: { api_key: string } } }> }
      assert.equal(parsed.contexts.nosec.elasticsearch.auth.api_key, apiKey)
      assert.equal(yaml.includes('$(pass:'), false)
      const st = await stat(cfg)
      assert.equal(st.mode & 0o777, 0o600)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(bin, { recursive: true, force: true })
    }
  })
})
