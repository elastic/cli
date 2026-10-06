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
import { registerApiCommand } from '../../src/api/register.ts'
import { _testSetFetch } from '../../src/api/request.ts'
import { setResolvedConfig, _testResetConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

function mockFetch (responder: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString()
    return responder(u, init)
  }) as unknown as typeof fetch
}

function makeProgram (): InstanceType<typeof Command> {
  const prog = new Command('elastic')
  prog.exitOverride()
  prog.option('--json', 'output as JSON')
  prog.addCommand(registerApiCommand())
  return prog
}

interface CapturedOutput { stdout: string, stderr: string, exitCode: number | undefined }

async function captured (run: () => Promise<void>): Promise<CapturedOutput> {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const origStdout = process.stdout.write.bind(process.stdout)
  const origStderr = process.stderr.write.bind(process.stderr)
  const origExit = process.exitCode
  process.stdout.write = ((chunk: unknown) => { if (typeof chunk === 'string') stdoutChunks.push(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => { if (typeof chunk === 'string') stderrChunks.push(chunk); return true }) as typeof process.stderr.write
  process.exitCode = undefined
  try {
    await run()
  } catch {
    // Commander exitOverride and handler errors: inspect captured streams
  } finally {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
  }
  const exitCode = process.exitCode
  process.exitCode = origExit
  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join(''), exitCode }
}

const esConfig: ResolvedConfig = {
  context: { elasticsearch: { url: 'http://localhost:9200', auth: { api_key: 'secret-key' } } },
}

describe('elastic api -- command', () => {
  beforeEach(() => {
    setResolvedConfig(esConfig)
  })

  afterEach(() => {
    _testResetConfig()
    _testSetFetch(globalThis.fetch)
  })

  it('dry-run prints the resolved request and does not fetch', async () => {
    let called = false
    const restore = _testSetFetch(mockFetch(() => {
      called = true
      return new Response('{}', { status: 200 })
    }))
    try {
      const out = await captured(async () => {
        await makeProgram().parseAsync(['--json', 'api', 'GET', '/', '--service', 'es', '--dry-run'], { from: 'user' })
      })
      assert.equal(called, false)
      const parsed = JSON.parse(out.stdout) as { method: string, url: string, redirect: string, headers: Record<string, string> }
      assert.equal(parsed.method, 'GET')
      assert.equal(parsed.url, 'http://localhost:9200/')
      assert.equal(parsed.redirect, 'error')
      assert.equal(parsed.headers['Authorization'], 'ApiKey ***')
    } finally {
      restore()
    }
  })

  it('GET / returns cluster info', async () => {
    const restore = _testSetFetch(mockFetch((url, init) => {
      assert.equal(url, 'http://localhost:9200/')
      assert.equal(init?.redirect, 'error')
      return new Response(JSON.stringify({ name: 'n1', cluster_name: 'docker-cluster' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))
    try {
      const out = await captured(async () => {
        await makeProgram().parseAsync(['--json', 'api', 'GET', '/', '--service', 'es'], { from: 'user' })
      })
      assert.deepEqual(JSON.parse(out.stdout), { name: 'n1', cluster_name: 'docker-cluster' })
      assert.notEqual(out.exitCode, 1)
    } finally {
      restore()
    }
  })

  it('encodes path params on the wire', async () => {
    let capturedUrl = ''
    const restore = _testSetFetch(mockFetch((url) => {
      capturedUrl = url
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    try {
      await captured(async () => {
        await makeProgram().parseAsync(
          ['--json', 'api', 'GET', '/foo bar', '--service', 'es'],
          { from: 'user' },
        )
      })
      assert.equal(capturedUrl, 'http://localhost:9200/foo%20bar')
    } finally {
      restore()
    }
  })

  it('sends --input-file as the JSON body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-api-'))
    const file = join(dir, 'doc.json')
    await writeFile(file, JSON.stringify({ name: 'Alice' }))
    let capturedBody: unknown
    let capturedInit: RequestInit = {}
    const restore = _testSetFetch(mockFetch((_url, init) => {
      capturedInit = init ?? {}
      capturedBody = init?.body
      return new Response('{"result":"created"}', { status: 201, headers: { 'content-type': 'application/json' } })
    }))
    try {
      const out = await captured(async () => {
        await makeProgram().parseAsync(
          ['--json', 'api', 'POST', '/idx/_doc', '--service', 'es', '--input-file', file],
          { from: 'user' },
        )
      })
      assert.equal(capturedBody, JSON.stringify({ name: 'Alice' }))
      assert.equal(capturedInit.redirect, 'error')
      assert.deepEqual(JSON.parse(out.stdout), { result: 'created' })
    } finally {
      restore()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('maps a 401 to a structured error', async () => {
    const restore = _testSetFetch(mockFetch(() =>
      new Response(JSON.stringify({ error: { type: 'security_exception', reason: 'unauthorized' } }), { status: 401 }),
    ))
    try {
      const out = await captured(async () => {
        await makeProgram().parseAsync(['--json', 'api', 'GET', '/', '--service', 'es'], { from: 'user' })
      })
      const parsed = JSON.parse(out.stderr) as { error: { code: string, status_code: number } }
      assert.equal(parsed.error.code, 'auth_required')
      assert.equal(parsed.error.status_code, 401)
      assert.equal(out.exitCode, 1)
    } finally {
      restore()
    }
  })

  it('maps missing config to missing_config', async () => {
    setResolvedConfig({ context: {} })
    const out = await captured(async () => {
      await makeProgram().parseAsync(['--json', 'api', 'GET', '/', '--service', 'kb'], { from: 'user' })
    })
    const parsed = JSON.parse(out.stderr) as { error: { code: string } }
    assert.equal(parsed.error.code, 'missing_config')
    assert.equal(out.exitCode, 1)
  })

  it('rejects path traversal as an input error', async () => {
    const out = await captured(async () => {
      await makeProgram().parseAsync(['--json', 'api', 'GET', '/foo/../bar', '--service', 'es'], { from: 'user' })
    })
    const parsed = JSON.parse(out.stderr) as { error: { code: string } }
    assert.equal(parsed.error.code, 'input_error')
    assert.equal(out.exitCode, 1)
  })

  it('forwards --header values', async () => {
    let capturedHeaders: Record<string, string> = {}
    const restore = _testSetFetch(mockFetch((_url, init) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    try {
      await captured(async () => {
        await makeProgram().parseAsync(
          ['--json', 'api', 'GET', '/', '--service', 'es', '-H', 'X-Opaque-Id: job-1'],
          { from: 'user' },
        )
      })
      assert.equal(capturedHeaders['X-Opaque-Id'], 'job-1')
    } finally {
      restore()
    }
  })
})
