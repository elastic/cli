/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { registerStatusCommand, runStatusChecks, _testSetFetch } from '../../src/status/register.ts'
import { clearConfigCache } from '../../src/config/loader.ts'
import type { ResolvedContext } from '../../src/config/types.ts'

const SAMPLE_HEALTH = JSON.stringify({ status: 'green', number_of_nodes: 3 })
const SAMPLE_KIBANA = JSON.stringify({
  status: { overall: { level: 'available' } },
  version: { number: '8.18.0' },
})
const SAMPLE_CLOUD = JSON.stringify({ user_id: 'me' })

function mockFetch (responder: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = typeof url === 'string' ? url : url.toString()
    return responder(u)
  }) as unknown as typeof fetch
}

function makeProgram (): InstanceType<typeof Command> {
  const prog = new Command('elastic')
  prog.exitOverride()
  prog.option('--config-file <path>', 'path to a config file')
  prog.option('--use-context <name>', 'override the active context')
  prog.option('--command-profile <name>', 'restrict available commands to a deployment profile')
  prog.option('--json', 'output as JSON')
  prog.option('--output-fields <list>', '')
  prog.option('--output-template <string>', '')
  prog.addCommand(registerStatusCommand())
  return prog
}

interface CapturedOutput { stdout: string, stderr: string, exitCode: number | undefined }

async function captured (run: () => Promise<void>): Promise<CapturedOutput> {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const origStdout = process.stdout.write.bind(process.stdout)
  const origStderr = process.stderr.write.bind(process.stderr)
  const origExit = process.exitCode
  process.stdout.write = ((chunk: string) => { stdoutChunks.push(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => { stderrChunks.push(chunk); return true }) as typeof process.stderr.write
  process.exitCode = undefined
  try {
    await run()
  } finally {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
  }
  const exitCode = process.exitCode
  process.exitCode = origExit
  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join(''), exitCode }
}

describe('runStatusChecks', () => {
  it('runs only the configured services concurrently', async () => {
    const seen: string[] = []
    const fetchFn = mockFetch((url) => {
      seen.push(url)
      if (url.includes('_cluster/health')) return new Response(SAMPLE_HEALTH, { status: 200 })
      return new Response('not configured', { status: 500 })
    })
    const ctx: ResolvedContext = {
      elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'k' } },
    }
    const result = await runStatusChecks('local', ctx, fetchFn)
    assert.equal(result.context, 'local')
    assert.ok(result.services.elasticsearch?.ok)
    assert.equal(result.services.kibana, undefined)
    assert.equal(result.services.cloud, undefined)
    assert.equal(seen.length, 1)
  })

  it('aggregates results across services', async () => {
    const fetchFn = mockFetch((url) => {
      if (url.includes('_cluster/health')) return new Response(SAMPLE_HEALTH, { status: 200 })
      if (url.includes('/api/status')) return new Response(SAMPLE_KIBANA, { status: 200 })
      if (url.includes('/api/v1/user')) return new Response('nope', { status: 401 })
      return new Response('', { status: 404 })
    })
    const ctx: ResolvedContext = {
      elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'k' } },
      kibana: { url: 'http://localhost:5601', auth: { api_key: 'k' } },
      cloud: { url: 'https://api.elastic-cloud.com', auth: { api_key: 'bad' } },
    }
    const result = await runStatusChecks('local', ctx, fetchFn)
    assert.equal(result.services.elasticsearch?.ok, true)
    assert.equal(result.services.kibana?.ok, true)
    assert.equal(result.services.cloud?.ok, false)
    if (result.services.cloud?.ok === false) {
      assert.equal(result.services.cloud.error, 'auth failed (401)')
    }
  })
})

describe('elastic status -- command', () => {
  let dir: string
  let configPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'elastic-status-'))
    configPath = join(dir, '.elasticrc.yml')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    clearConfigCache()
  })

  async function writeConfig (yaml: string): Promise<void> {
    await writeFile(configPath, yaml)
  }

  it('prints aligned-column text by default and exits 0 on full success', async () => {
    await writeConfig([
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth: { api_key: k }',
      '    kibana:',
      '      url: http://localhost:5601',
      '      auth: { api_key: k }',
    ].join('\n'))
    const restore = _testSetFetch(mockFetch((url) => {
      if (url.includes('_cluster/health')) return new Response(SAMPLE_HEALTH, { status: 200 })
      if (url.includes('/api/status')) return new Response(SAMPLE_KIBANA, { status: 200 })
      return new Response('not configured', { status: 500 })
    }))
    try {
      const out = await captured(async () => {
        const prog = makeProgram()
        await prog.parseAsync(['--config-file', configPath, 'status'], { from: 'user' })
      })
      assert.ok(out.stdout.includes('Context: local'), `expected Context line, got: ${out.stdout}`)
      assert.ok(out.stdout.includes('Elasticsearch'), `expected ES row, got: ${out.stdout}`)
      assert.ok(out.stdout.includes('green (3 nodes)'), `expected ES summary, got: ${out.stdout}`)
      assert.ok(out.stdout.includes('available (8.18.0)'), `expected Kibana summary, got: ${out.stdout}`)
      assert.ok(out.stdout.includes('✓'), `expected check glyph, got: ${out.stdout}`)
      // Bun defaults process.exitCode to 0 instead of undefined; assert against the
      // failure value rather than the runtime-specific "no value set" sentinel.
      assert.notEqual(out.exitCode, 1, `unexpected failure exit code, got: ${out.exitCode}`)
    } finally {
      restore()
    }
  })

  it('emits structured JSON under --json and sets exit code 1 on any failure', async () => {
    await writeConfig([
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth: { api_key: bad }',
      '    cloud:',
      '      url: https://api.elastic-cloud.com',
      '      auth: { api_key: k }',
    ].join('\n'))
    const restore = _testSetFetch(mockFetch((url) => {
      if (url.includes('_cluster/health')) return new Response('no', { status: 401 })
      if (url.includes('/api/v1/user')) return new Response(SAMPLE_CLOUD, { status: 200 })
      return new Response('', { status: 404 })
    }))
    try {
      const out = await captured(async () => {
        const prog = makeProgram()
        await prog.parseAsync(['--config-file', configPath, '--json', 'status'], { from: 'user' })
      })
      const parsed = JSON.parse(out.stdout) as {
        context: string
        services: {
          elasticsearch: { ok: boolean, error?: string }
          cloud: { ok: boolean }
        }
      }
      assert.equal(parsed.context, 'local')
      assert.equal(parsed.services.elasticsearch.ok, false)
      assert.equal(parsed.services.elasticsearch.error, 'auth failed (401)')
      assert.equal(parsed.services.cloud.ok, true)
      assert.equal(out.exitCode, 1)
    } finally {
      restore()
    }
  })

  it('honours --use-context to check a non-default context', async () => {
    await writeConfig([
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://es-local',
      '      auth: { api_key: k }',
      '  staging:',
      '    elasticsearch:',
      '      url: http://es-staging',
      '      auth: { api_key: k }',
    ].join('\n'))
    const restore = _testSetFetch(mockFetch(() =>
      new Response(SAMPLE_HEALTH, { status: 200 })
    ))
    try {
      const out = await captured(async () => {
        const prog = makeProgram()
        await prog.parseAsync(
          ['--config-file', configPath, '--use-context', 'staging', '--json', 'status'],
          { from: 'user' },
        )
      })
      const parsed = JSON.parse(out.stdout) as { context: string, services: { elasticsearch: { url: string } } }
      assert.equal(parsed.context, 'staging')
      assert.equal(parsed.services.elasticsearch.url, 'http://es-staging')
    } finally {
      restore()
    }
  })

  it('returns a config_error envelope when no config file is found', async () => {
    const missingPath = join(dir, 'does-not-exist.yml')
    const out = await captured(async () => {
      const prog = makeProgram()
      await prog.parseAsync(['--config-file', missingPath, '--json', 'status'], { from: 'user' })
    })
    assert.ok(out.stderr.length > 0, `expected stderr, got: ${out.stderr}`)
    const parsed = JSON.parse(out.stderr) as { error: { code: string, message: string } }
    assert.equal(parsed.error.code, 'config_error')
    assert.ok(parsed.error.message.length > 0)
    assert.equal(out.exitCode, 1)
  })

  it('omits services missing from the context', async () => {
    await writeConfig([
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://es-only',
      '      auth: { api_key: k }',
    ].join('\n'))
    const restore = _testSetFetch(mockFetch(() => new Response(SAMPLE_HEALTH, { status: 200 })))
    try {
      const out = await captured(async () => {
        const prog = makeProgram()
        await prog.parseAsync(['--config-file', configPath, '--json', 'status'], { from: 'user' })
      })
      const parsed = JSON.parse(out.stdout) as { services: Record<string, unknown> }
      assert.ok(parsed.services.elasticsearch != null)
      assert.equal(parsed.services.kibana, undefined)
      assert.equal(parsed.services.cloud, undefined)
    } finally {
      restore()
    }
  })

  it('--dry-run validates and exits without making any HTTP calls', async () => {
    await writeConfig([
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth: { api_key: k }',
    ].join('\n'))
    let called = false
    const restore = _testSetFetch(mockFetch(() => {
      called = true
      return new Response('', { status: 200 })
    }))
    try {
      const out = await captured(async () => {
        const prog = makeProgram()
        await prog.parseAsync(['--config-file', configPath, 'status', '--dry-run'], { from: 'user' })
      })
      assert.equal(called, false, 'fetch should not be called in --dry-run')
      assert.ok(out.stdout.length > 0, `expected dry-run message on stdout, got: ${out.stdout}`)
    } finally {
      restore()
    }
  })
})
