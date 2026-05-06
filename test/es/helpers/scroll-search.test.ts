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
import { createScrollSearchCommand } from '../../../src/es/helpers/scroll-search.ts'
import type { ScrollSearchDeps } from '../../../src/es/helpers/scroll-search.ts'
import { _testSetStdinReader } from '../../../src/factory.ts'
import { Command } from 'commander'

interface MockResponse {
  _scroll_id?: string
  hits?: { hits?: Array<{ _source: unknown }> }
}

function mockTransport (responses: MockResponse[]): {
  transport: EsClient
  requests: Array<{ params: EsRequestParams }>
} {
  const requests: Array<{ params: EsRequestParams }> = []
  let callIndex = 0
  const transport = {
    request: async (params: EsRequestParams) => {
      requests.push({ params })
      const response = responses[callIndex] ?? { hits: { hits: [] } }
      callIndex++
      return response
    }
  } as unknown as EsClient
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

function makeDeps (transport: EsClient, output?: ReturnType<typeof captureOutput>): ScrollSearchDeps {
  const io = output ?? captureOutput()
  return { getEsClient: () => transport, stdout: io.stdout, stderr: io.stderr }
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

  const restoreStdin = _testSetStdinReader(() => '')
  try {
    await program.parseAsync(['node', 'test', 'scroll-search', ...args])
  } finally {
    restoreStdin()
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
      ['--index', 'test-idx', '--query', '{}'],
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
      ['--index', 'test-idx', '--query', '{}', '--max-docs', '2'],
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

  it('wraps --query value under "query" in the request body', async () => {
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
    assert.deepStrictEqual(body, { query: { match: { title: 'test' } } })
  })

  it('treats --query-file contents as the full search body', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'scroll-test-'))
    const filePath = join(tmpDir, 'body.json')
    writeFileSync(filePath, '{"query":{"match_all":{}},"sort":[{"_doc":"asc"}]}')

    const output = captureOutput()
    const { transport, requests } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query-file', filePath, '--json'],
      makeDeps(transport, output)
    )

    const body = requests[0]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(body, { query: { match_all: {} }, sort: [{ _doc: 'asc' }] })
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
      request: async (params: EsRequestParams) => {
        if (params.method === 'DELETE') {
          deleteCallCount++
          return {}
        }
        if (params.path!.includes('_search/scroll')) {
          throw new Error('scroll failed')
        }
        return { _scroll_id: 'scroll-err', hits: { hits: [{ _source: { a: 1 } }] } }
      }
    } as unknown as EsClient

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    assert.equal(deleteCallCount, 1, 'Scroll should be cleared even after error')
  })

  it('returns missing_config error when transport is not configured', async () => {
    const output = captureOutput()
    const deps: ScrollSearchDeps = {
      getEsClient: () => { throw new Error('missing_config: no ES configured') },
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

  it('returns all documents in a single JSON object when --json is active', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { id: 1 } }, { _source: { id: 2 } }] }
      },
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { id: 3 } }] }
      },
      { hits: { hits: [] } },
      {}
    ])

    const { result } = await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    const r = result as Record<string, unknown>
    assert.ok(Array.isArray(r.documents), 'result should have a documents array')
    assert.deepStrictEqual(r.documents, [{ id: 1 }, { id: 2 }, { id: 3 }])
    assert.equal(r.total_docs, 3)
    assert.ok(typeof r.elapsed_ms === 'number')
    assert.equal(output.stdout.chunks.length, 0, 'should not stream NDJSON to deps.stdout in --json mode')
  })

  it('respects --max-docs in --json mode', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      {
        _scroll_id: 'scroll-1',
        hits: { hits: [{ _source: { a: 1 } }, { _source: { a: 2 } }, { _source: { a: 3 } }] }
      },
      {}
    ])

    const { result } = await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--max-docs', '2', '--json'],
      makeDeps(transport, output)
    )

    const r = result as Record<string, unknown>
    assert.deepStrictEqual(r.documents, [{ a: 1 }, { a: 2 }])
    assert.equal(r.total_docs, 2)
    assert.equal(output.stdout.chunks.length, 0)
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

  it('warns on stderr when --json is used without explicit --max-docs', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [{ _source: { a: 1 } }] } },
      { hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      makeDeps(transport, output)
    )

    const stderrText = output.stderr.chunks.join('')
    assert.ok(stderrText.includes('--max-docs'), `Expected unbounded warning in stderr, got: ${stderrText}`)
  })

  it('does not warn when --json is used with explicit --max-docs', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [{ _source: { a: 1 } }] } },
      { hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json', '--max-docs', '100'],
      makeDeps(transport, output)
    )

    const stderrText = output.stderr.chunks.join('')
    assert.ok(!stderrText.includes('--max-docs'), `Should not warn when --max-docs is explicit, got: ${stderrText}`)
  })

  it('does not warn in NDJSON mode (no --json) even without --max-docs', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [{ _source: { a: 1 } }] } },
      { hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}'],
      makeDeps(transport, output)
    )

    const stderrText = output.stderr.chunks.join('')
    assert.ok(!stderrText.includes('--max-docs'), `Should not warn in NDJSON mode, got: ${stderrText}`)
  })

  it('does not warn when ELASTIC_NO_WARN=1 is set', async () => {
    const output = captureOutput()
    const { transport } = mockTransport([
      { _scroll_id: 'scroll-1', hits: { hits: [{ _source: { a: 1 } }] } },
      { hits: { hits: [] } },
      {}
    ])

    await runCommand(
      ['--index', 'test-idx', '--query', '{}', '--json'],
      { ...makeDeps(transport, output), env: { ELASTIC_NO_WARN: '1' } }
    )

    const stderrText = output.stderr.chunks.join('')
    assert.ok(!stderrText.includes('--max-docs'), `Should not warn when ELASTIC_NO_WARN=1, got: ${stderrText}`)
  })
})
