/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { EsClient, EsRequestParams } from '../../../src/lib/es-client.ts'
import { createMsearchCommand } from '../../../src/es/helpers/msearch.ts'
import type { MsearchDeps } from '../../../src/es/helpers/msearch.ts'
import { _testSetStdinReader } from '../../../src/factory.ts'
import { Command } from 'commander'

function mockTransport (responses: Array<{ responses: unknown[] }>): {
  transport: EsClient
  requests: Array<{ params: EsRequestParams, opts?: { headers?: Record<string, string> } }>
} {
  const requests: Array<{ params: EsRequestParams, opts?: { headers?: Record<string, string> } }> = []
  let callIndex = 0
  const transport = {
    request: async (params: EsRequestParams, opts?: { headers?: Record<string, string> }) => {
      requests.push({ params, opts })
      const response = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return response
    }
  } as unknown as EsClient
  return { transport, requests }
}

function makeDeps (transport: EsClient): MsearchDeps {
  return { getEsClient: () => transport }
}

async function runCommand (args: string[], deps: MsearchDeps): Promise<unknown> {
  const cmd = createMsearchCommand(deps)
  const program = new Command()
  program.exitOverride()
  program.option('--json', 'output as JSON')
  program.addCommand(cmd)

  // Capture stdout and stderr
  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  process.stdout.write = ((chunk: string) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stderr.write

  const restoreStdin = _testSetStdinReader(() => '')
  try {
    await program.parseAsync(['node', 'test', 'msearch', ...args])
  } catch {
    // Commander exitOverride throws on errors; output is already captured in stderr
  } finally {
    restoreStdin()
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exitCode = 0
  }

  // The test runner may inject internal protocol bytes into stdout.
  // Try each chunk individually (last-to-first) to find valid JSON.
  const errOutput = stderrChunks.join('')
  if (errOutput.trim().length > 0) {
    try { return JSON.parse(errOutput.trim()) } catch { return errOutput.trim() }
  }
  // Search stdout chunks in reverse for a parseable JSON chunk
  for (let i = stdoutChunks.length - 1; i >= 0; i--) {
    const chunk = stdoutChunks[i]!.trim()
    if (chunk.length > 0 && (chunk[0] === '{' || chunk[0] === '[')) {
      try { return JSON.parse(chunk) } catch { /* continue */ }
    }
  }
  const stdOutput = stdoutChunks.join('')
  if (stdOutput.trim().length > 0) return stdOutput.trim()
  return undefined
}

function makeSearchInput (items: Array<{ header?: Record<string, unknown>, body: Record<string, unknown> }>): string {
  return JSON.stringify(items)
}

describe('msearch command', () => {
  it('creates a command named msearch', () => {
    const { transport } = mockTransport([])
    const cmd = createMsearchCommand(makeDeps(transport))
    assert.equal(cmd.name(), 'msearch')
  })

  it('batches and sends searches from --query-file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([
      { body: { query: { match_all: {} } } },
      { body: { query: { term: { status: 'active' } } } }
    ]))

    const { transport, requests } = mockTransport([
      { responses: [{ hits: { total: 10 } }, { hits: { total: 5 } }] }
    ])

    const result = await runCommand(
      ['--query-file', filePath, '--index', 'test-idx', '--json'],
      makeDeps(transport)
    ) as Record<string, unknown>

    assert.equal(requests.length, 1)
    assert.ok(result != null && typeof result === 'object', `Expected object result, got: ${JSON.stringify(result)}`)
    assert.ok('responses' in (result as Record<string, unknown>), `Expected responses key in result, got: ${JSON.stringify(result)}`)
    const responses = (result as Record<string, unknown>).responses as unknown[]
    assert.equal(responses.length, 2)
  })

  it('splits searches into batches by --batch-size', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    const items = Array.from({ length: 6 }, (_, i) => ({
      body: { query: { term: { id: i } } }
    }))
    writeFileSync(filePath, makeSearchInput(items))

    const { transport, requests } = mockTransport([
      { responses: [{ hits: {} }, { hits: {} }] },
      { responses: [{ hits: {} }, { hits: {} }] },
      { responses: [{ hits: {} }, { hits: {} }] }
    ])

    const result = await runCommand(
      ['--query-file', filePath, '--batch-size', '2', '--index', 'test-idx', '--json'],
      makeDeps(transport)
    ) as Record<string, unknown>

    assert.equal(requests.length, 3, 'Expected 3 batches of 2')
    assert.ok(result != null && typeof result === 'object', `Expected object result, got: ${JSON.stringify(result)}`)
    assert.ok('responses' in (result as Record<string, unknown>), `Expected responses key in result, got: ${JSON.stringify(result)}`)
    assert.equal(((result as Record<string, unknown>).responses as unknown[]).length, 6)
  })

  it('applies default index from --index to items without header.index', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([
      { body: { query: { match_all: {} } } },
      { header: { index: 'custom-idx' }, body: { query: { match_all: {} } } }
    ]))

    const { transport, requests } = mockTransport([
      { responses: [{}, {}] }
    ])

    await runCommand(
      ['--query-file', filePath, '--index', 'default-idx', '--json'],
      makeDeps(transport)
    )

    const body = requests[0]!.params.body as string
    const lines = body.split('\n').filter((l: string) => l.length > 0)
    const header1 = JSON.parse(lines[0]!)
    const header2 = JSON.parse(lines[2]!)
    assert.equal(header1.index, 'default-idx')
    assert.equal(header2.index, 'custom-idx')
  })

  it('sends content-type application/x-ndjson header', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([{ body: { query: { match_all: {} } } }]))

    const { transport, requests } = mockTransport([{ responses: [{}] }])

    await runCommand(
      ['--query-file', filePath, '--index', 'test-idx', '--json'],
      makeDeps(transport)
    )

    const opts = requests[0]!.opts as Record<string, unknown>
    const headers = opts.headers as Record<string, string>
    assert.equal(headers['content-type'], 'application/x-ndjson')
  })

  it('builds correct NDJSON body with alternating header/body lines', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([
      { body: { query: { match_all: {} } } }
    ]))

    const { transport, requests } = mockTransport([{ responses: [{}] }])

    await runCommand(
      ['--query-file', filePath, '--index', 'test-idx', '--json'],
      makeDeps(transport)
    )

    const body = requests[0]!.params.body as string
    const lines = body.split('\n')
    // header line, body line, trailing empty
    assert.equal(lines.length, 3)
    assert.deepStrictEqual(JSON.parse(lines[0]!), { index: 'test-idx' })
    assert.deepStrictEqual(JSON.parse(lines[1]!), { query: { match_all: {} } })
    assert.equal(lines[2], '') // trailing newline
  })

  it('uses index-specific path when --index is provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([{ body: { query: { match_all: {} } } }]))

    const { transport, requests } = mockTransport([{ responses: [{}] }])

    await runCommand(
      ['--query-file', filePath, '--index', 'my-idx', '--json'],
      makeDeps(transport)
    )

    assert.ok(requests[0]!.params.path!.includes('my-idx'))
    assert.ok(requests[0]!.params.path!.includes('_msearch'))
  })

  it('returns missing_config error when transport is not configured', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, makeSearchInput([{ body: { query: { match_all: {} } } }]))

    const deps: MsearchDeps = {
      getEsClient: () => { throw new Error('missing_config: no ES configured') }
    }

    const result = await runCommand(
      ['--query-file', filePath, '--json'],
      deps
    ) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'missing_config')
  })

  it('returns empty responses for empty input array', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'msearch-test-'))
    const filePath = join(tmpDir, 'searches.json')
    writeFileSync(filePath, '[]')

    const { transport } = mockTransport([])

    const result = await runCommand(
      ['--query-file', filePath, '--json'],
      makeDeps(transport)
    ) as Record<string, unknown>

    assert.deepStrictEqual(result.responses, [])
  })
})
