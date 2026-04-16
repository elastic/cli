/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Transport, TransportRequestParams } from '@elastic/transport'
import { createScrollSearchCommand } from '../../../src/es/helpers/scroll-search.ts'
import type { ScrollSearchDeps } from '../../../src/es/helpers/scroll-search.ts'
import { Command } from 'commander'

interface MockResponse {
  _scroll_id?: string
  hits?: { hits?: Array<{ _source: unknown }> }
}

function mockTransport (responses: MockResponse[]): {
  transport: Transport
  requests: Array<{ params: TransportRequestParams }>
} {
  const requests: Array<{ params: TransportRequestParams }> = []
  let callIndex = 0
  const transport = {
    request: async (params: TransportRequestParams) => {
      requests.push({ params })
      const response = responses[callIndex] ?? { hits: { hits: [] } }
      callIndex++
      return response
    }
  } as unknown as Transport
  return { transport, requests }
}

function captureOutput (): { stdout: { write: (s: string) => boolean, chunks: string[] }, stderr: { write: (s: string) => boolean, chunks: string[] } } {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  return {
    stdout: {
      chunks: stdoutChunks,
      write: (s: string) => { stdoutChunks.push(s); return true }
    },
    stderr: {
      chunks: stderrChunks,
      write: (s: string) => { stderrChunks.push(s); return true }
    }
  }
}

function makeDeps (transport: Transport, output?: ReturnType<typeof captureOutput>): ScrollSearchDeps {
  const io = output ?? captureOutput()
  return { getTransport: () => transport, stdout: io.stdout, stderr: io.stderr }
}

async function runCommand (args: string[], deps: ScrollSearchDeps): Promise<{ result: unknown, stdout: string[], stderr: string[] }> {
  const cmd = createScrollSearchCommand(deps)
  const program = new Command()
  program.exitOverride()
  program.option('--json', 'output as JSON')
  program.addCommand(cmd)

  const progChunks: string[] = []
  const errChunks: string[] = []
  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: string) => {
    progChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => {
    errChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }) as typeof process.stderr.write

  try {
    await program.parseAsync(['node', 'test', 'scroll-search', ...args])
  } finally {
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exitCode = 0
  }

  let result: unknown
  // Prefer stderr (error results) over stdout; parse whichever has content
  const errOutput = errChunks.join('')
  const stdOutput = progChunks.join('')
  const output = errOutput.trim().length > 0 ? errOutput : stdOutput
  if (output.trim().length > 0) {
    try { result = JSON.parse(output.trim()) } catch { result = output.trim() }
  }

  return {
    result,
    stdout: (deps.stdout as { chunks: string[] }).chunks ?? [],
    stderr: (deps.stderr as { chunks: string[] }).chunks ?? []
  }
}

describe('scroll-search command', () => {
  it('creates a command named scroll-search', () => {
    const { transport } = mockTransport([])
    const cmd = createScrollSearchCommand(makeDeps(transport))
    assert.equal(cmd.name(), 'scroll-search')
  })

  it('fetches all documents across scroll pages', async () => {
    const output = captureOutput()
    const { transport, requests } = mockTransport([
      // Initial search response
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { id: 1 } }, { _source: { id: 2 } }] }
      },
      // Second page
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { id: 3 } }] }
      },
      // Empty page — signals end
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [] }
      },
      // DELETE scroll response
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    // 3 docs streamed as NDJSON
    assert.equal(output.stdout.chunks.length, 3)
    assert.deepStrictEqual(JSON.parse(output.stdout.chunks[0]!), { id: 1 })
    assert.deepStrictEqual(JSON.parse(output.stdout.chunks[1]!), { id: 2 })
    assert.deepStrictEqual(JSON.parse(output.stdout.chunks[2]!), { id: 3 })

    // Requests: initial search + 2 scroll + 1 delete
    assert.equal(requests.length, 4)
    assert.equal(requests[0]!.params.method, 'POST')
    assert.ok(requests[0]!.params.path!.includes('_search'))
    assert.equal(requests[3]!.params.method, 'DELETE')
  })

  it('respects --max-docs limit', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { a: 1 } }, { _source: { a: 2 } }, { _source: { a: 3 } }] }
      },
      // DELETE scroll
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--max-docs', '2', '--json'],
      makeDeps(transport, output)
    )

    assert.equal(output.stdout.chunks.length, 2)
  })

  it('passes scroll and size parameters to initial search', async () => {
    const output = captureOutput()
    const { transport, requests } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--scroll', '5m', '--size', '500', '--json'],
      makeDeps(transport, output)
    )

    const qs = requests[0]!.params.querystring as Record<string, unknown>
    assert.equal(qs.scroll, '5m')
    assert.equal(qs.size, 500)
  })

  it('passes query body from --query flag', async () => {
    const output = captureOutput()
    const { transport, requests } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{"match":{"title":"test"}}', '--json'],
      makeDeps(transport, output)
    )

    const body = requests[0]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(body, { match: { title: 'test' } })
  })

  it('reads query from --input-file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'scroll-test-'))
    const filePath = join(tmpDir, 'query.json')
    writeFileSync(filePath, '{"match_all":{}}')

    const output = captureOutput()
    const { transport, requests } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--input-file', filePath, '--json'],
      makeDeps(transport, output)
    )

    const body = requests[0]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(body, { match_all: {} })
  })

  it('clears scroll context on completion', async () => {
    const output = captureOutput()
    const { transport, requests } = mockTransport([
      { _scroll_id: 'scroll-abc', hits: { hits: [{ _source: { a: 1 } }] } },
      { _scroll_id: 'scroll-abc', hits: { hits: [] } },
      {} // DELETE response
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    const deleteReq = requests.find((r) => r.params.method === 'DELETE')
    assert.ok(deleteReq != null, 'Expected a DELETE request to clear scroll')
    assert.deepStrictEqual((deleteReq.params.body as Record<string, unknown>).scroll_id, 'scroll-abc')
  })

  it('clears scroll context on transport error', async () => {
    const output = captureOutput()
    let deleteCallCount = 0
    const transport = {
      request: async (params: TransportRequestParams) => {
        if (params.method === 'DELETE') {
          deleteCallCount++
          return {}
        }
        if (params.path!.includes('_search/scroll')) {
          throw new Error('scroll failed')
        }
        return { _scroll_id: 'scroll-err', hits: { hits: [{ _source: { a: 1 } }] } }
      }
    } as unknown as Transport

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    assert.equal(deleteCallCount, 1, 'Scroll should be cleared even after error')
  })

  it('returns missing_config error when transport is not configured', async () => {
    const output = captureOutput()
    const deps: ScrollSearchDeps = {
      getTransport: () => { throw new Error('missing_config: no ES configured') },
      stdout: output.stdout,
      stderr: output.stderr
    }

    const { result } = await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      deps
    )

    const r = result as Record<string, unknown>
    const error = r.error as Record<string, unknown>
    assert.equal(error.code, 'missing_config')
  })

  it('writes summary to stderr', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [{ _source: { a: 1 } }] } },
      { _scroll_id: 'scroll-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    const stderrText = output.stderr.chunks.join('')
    assert.ok(stderrText.includes('1 documents'), `Expected summary in stderr, got: ${stderrText}`)
  })
})
