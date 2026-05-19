/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { EsClient, EsRequestParams } from '../../../src/lib/es-client.ts'
import { createWatchCommand, applyTemplate } from '../../../src/es/helpers/watch.ts'
import type { WatchDeps } from '../../../src/es/helpers/watch.ts'
import { Command } from 'commander'
import { _testSetStdinReader } from '../../../src/factory.ts'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

interface MockHit {
  _source: Record<string, unknown>
  sort?: unknown[]
}

interface MockResponse {
  hits?: { hits?: MockHit[] }
}

/**
 * Builds a mock EsClient from a queue of responses.  Each `request()` call
 * dequeues the next item; after the queue is exhausted every call returns an
 * empty hit list so polls stop producing results.
 */
function mockTransport (responses: MockResponse[]): {
  transport: EsClient
  requests: Array<{ params: EsRequestParams }>
} {
  const requests: Array<{ params: EsRequestParams }> = []
  let callIndex = 0
  const transport = {
    request: async (params: EsRequestParams) => {
      requests.push({ params })
      const resp = responses[callIndex] ?? { hits: { hits: [] } }
      callIndex++
      return resp
    },
  } as unknown as EsClient
  return { transport, requests }
}

function captureOutput () {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  return {
    stdout: {
      chunks: stdoutChunks,
      write: (s: string) => { stdoutChunks.push(s); return true },
    },
    stderr: {
      chunks: stderrChunks,
      write: (s: string) => { stderrChunks.push(s); return true },
    },
  }
}

/** Builds a WatchDeps where `sleep` resolves immediately and signals are controllable. */
function makeDeps (
  transport: EsClient,
  io = captureOutput(),
  opts: { stopAfterPolls?: number } = {},
): WatchDeps & { io: ReturnType<typeof captureOutput> } {
  let pollCount = 0
  const stopAfter = opts.stopAfterPolls ?? 1
  const signalHandlers = new Map<string, (() => void)[]>()

  return {
    io,
    getEsClient: () => transport,
    stdout: io.stdout,
    stderr: io.stderr,
    sleep: async () => {
      pollCount++
      if (pollCount >= stopAfter) {
        // Trigger SIGINT to stop the watch loop after the configured number of sleeps.
        for (const h of signalHandlers.get('SIGINT') ?? []) h()
      }
    },
    onSignal: (signal, handler) => {
      const list = signalHandlers.get(signal) ?? []
      list.push(handler)
      signalHandlers.set(signal, list)
    },
    offSignal: (signal, handler) => {
      const list = (signalHandlers.get(signal) ?? []).filter((h) => h !== handler)
      signalHandlers.set(signal, list)
    },
  }
}

async function runCommand (
  args: string[],
  deps: WatchDeps,
): Promise<{ stdout: string[]; stderr: string[] }> {
  const cmd = createWatchCommand(deps)
  const program = new Command()
  program.exitOverride()
  program.addCommand(cmd)

  const restoreStdin = _testSetStdinReader(() => '')
  try {
    await program.parseAsync(['node', 'test', 'watch', ...args])
  } finally {
    restoreStdin()
    process.exitCode = 0
  }

  return {
    stdout: (deps.stdout as { chunks: string[] }).chunks ?? [],
    stderr: (deps.stderr as { chunks: string[] }).chunks ?? [],
  }
}

// ---------------------------------------------------------------------------
// applyTemplate unit tests
// ---------------------------------------------------------------------------

describe('applyTemplate', () => {
  it('substitutes top-level fields', () => {
    assert.equal(applyTemplate('{message}', { message: 'hello' }), 'hello')
  })

  it('substitutes nested fields using dot notation', () => {
    assert.equal(
      applyTemplate('{log.level}', { log: { level: 'error' } }),
      'error',
    )
  })

  it('leaves placeholder intact when field is missing', () => {
    assert.equal(applyTemplate('{missing}', {}), '{missing}')
  })

  it('handles multiple placeholders in one template', () => {
    assert.equal(
      applyTemplate('{ts} [{level}] {msg}', { ts: '2024-01-01', level: 'info', msg: 'ok' }),
      '2024-01-01 [info] ok',
    )
  })

  it('coerces non-string values to string', () => {
    assert.equal(applyTemplate('{count}', { count: 42 }), '42')
  })
})

// ---------------------------------------------------------------------------
// createWatchCommand tests
// ---------------------------------------------------------------------------

describe('watch command', () => {
  it('creates a command named watch', () => {
    const { transport } = mockTransport([])
    const cmd = createWatchCommand(makeDeps(transport))
    assert.equal(cmd.name(), 'watch')
  })

  it('performs an anchor search before the first poll', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      // Anchor: most recent doc
      { hits: { hits: [{ _source: { id: 0 }, sort: ['2024-01-01T00:00:00Z', 'id0'] }] } },
      // First poll: one new doc
      { hits: { hits: [{ _source: { id: 1 }, sort: ['2024-01-02T00:00:00Z', 'id1'] }] } },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'my-index'], deps)

    // First request is the anchor (sort desc, size 1)
    const anchorReq = requests[0]!.params.body as Record<string, unknown>
    const sortArr = anchorReq.sort as Array<Record<string, string>>
    assert.equal(sortArr[0]!['@timestamp'], 'desc', 'anchor should sort descending')
    assert.equal(anchorReq.size, 1)

    // Second request is the poll (sort asc with search_after)
    const pollReq = requests[1]!.params.body as Record<string, unknown>
    assert.deepEqual(pollReq.search_after, ['2024-01-01T00:00:00Z', 'id0'])
    const pollSort = pollReq.sort as Array<Record<string, string>>
    assert.equal(pollSort[0]!['@timestamp'], 'asc')
  })

  it('streams new documents as NDJSON to stdout', async () => {
    const io = captureOutput()
    const { transport } = mockTransport([
      // Anchor: empty index
      { hits: { hits: [] } },
      // First poll: two new docs
      {
        hits: {
          hits: [
            { _source: { msg: 'first' }, sort: ['t1', 'id1'] },
            { _source: { msg: 'second' }, sort: ['t2', 'id2'] },
          ],
        },
      },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs'], deps)

    assert.equal(io.stdout.chunks.length, 2)
    assert.deepEqual(JSON.parse(io.stdout.chunks[0]!), { msg: 'first' })
    assert.deepEqual(JSON.parse(io.stdout.chunks[1]!), { msg: 'second' })
  })

  it('applies --format template to each document', async () => {
    const io = captureOutput()
    const { transport } = mockTransport([
      { hits: { hits: [] } }, // anchor
      {
        hits: {
          hits: [{ _source: { '@timestamp': '2024-01-01', message: 'hello' }, sort: ['t1', 'id1'] }],
        },
      },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs', '--format', '{@timestamp} {message}'], deps)

    assert.equal(io.stdout.chunks.length, 1)
    assert.equal(io.stdout.chunks[0]!.trim(), '2024-01-01 hello')
  })

  it('advances search_after cursor after each poll', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      { hits: { hits: [] } }, // anchor (empty)
      // First poll returns two docs
      {
        hits: {
          hits: [
            { _source: { n: 1 }, sort: ['t1', 'a'] },
            { _source: { n: 2 }, sort: ['t2', 'b'] },
          ],
        },
      },
      // Second poll — stop after this
      { hits: { hits: [{ _source: { n: 3 }, sort: ['t3', 'c'] }] } },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 2 })
    await runCommand(['--index', 'logs'], deps)

    // Second poll should use the sort value of doc #2
    const secondPoll = requests[2]!.params.body as Record<string, unknown>
    assert.deepEqual(secondPoll.search_after, ['t2', 'b'])
  })

  it('uses --from timestamp as range filter on first request', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      // First (and only) poll
      { hits: { hits: [{ _source: { msg: 'new' }, sort: ['t1', 'id1'] }] } },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs', '--from', '2024-06-01T00:00:00Z'], deps)

    // Should not perform an anchor search; first request is the poll with range filter.
    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as Record<string, unknown>
    const query = body.query as Record<string, unknown>
    const range = query.range as Record<string, Record<string, string>>
    assert.equal(range['@timestamp']!.gt, '2024-06-01T00:00:00Z')
  })

  it('does NOT add range filter on second poll once cursor is set', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      // First poll with range filter
      { hits: { hits: [{ _source: { n: 1 }, sort: ['t1', 'id1'] }] } },
      // Second poll — cursor only, no range filter
      { hits: { hits: [{ _source: { n: 2 }, sort: ['t2', 'id2'] }] } },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 2 })
    await runCommand(['--index', 'logs', '--from', '2024-01-01T00:00:00Z'], deps)

    const secondPoll = requests[1]!.params.body as Record<string, unknown>
    // search_after is present, no range query
    assert.ok(secondPoll.search_after != null)
    const query = secondPoll.query as Record<string, unknown> | undefined
    assert.ok(query?.range == null, 'second poll should not have a range filter')
  })

  it('immediately re-polls (no sleep) when a full page is returned', async () => {
    const io = captureOutput()
    let sleepCallCount = 0
    const { transport } = mockTransport([
      { hits: { hits: [] } }, // anchor
      // Full page (size=2)
      {
        hits: {
          hits: [
            { _source: { n: 1 }, sort: ['t1', 'id1'] },
            { _source: { n: 2 }, sort: ['t2', 'id2'] },
          ],
        },
      },
      // Partial page — triggers sleep → SIGINT → stop
      { hits: { hits: [{ _source: { n: 3 }, sort: ['t3', 'id3'] }] } },
    ])

    const signalHandlers = new Map<string, (() => void)[]>()
    const deps: WatchDeps & { io: ReturnType<typeof captureOutput> } = {
      io,
      getEsClient: () => transport,
      stdout: io.stdout,
      stderr: io.stderr,
      sleep: async () => {
        sleepCallCount++
        for (const h of signalHandlers.get('SIGINT') ?? []) h()
      },
      onSignal: (signal, handler) => {
        const list = signalHandlers.get(signal) ?? []
        list.push(handler)
        signalHandlers.set(signal, list)
      },
      offSignal: (signal, handler) => {
        const list = (signalHandlers.get(signal) ?? []).filter((h) => h !== handler)
        signalHandlers.set(signal, list)
      },
    }

    await runCommand(['--index', 'logs', '--size', '2'], deps)

    // sleep should only be called once (after the partial second poll), not after the full page
    assert.equal(sleepCallCount, 1)
    assert.equal(io.stdout.chunks.length, 3)
  })

  it('uses the configured --sort-field for sorting', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      { hits: { hits: [] } }, // anchor
      { hits: { hits: [] } }, // poll
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs', '--sort-field', 'created_at'], deps)

    const anchorSort = (requests[0]!.params.body as Record<string, unknown>).sort as Array<Record<string, string>>
    assert.ok('created_at' in anchorSort[0]!, 'anchor should use --sort-field')

    const pollSort = (requests[1]!.params.body as Record<string, unknown>).sort as Array<Record<string, string>>
    assert.ok('created_at' in pollSort[0]!, 'poll should use --sort-field')
  })

  it('filters using --query', async () => {
    const io = captureOutput()
    const { transport, requests } = mockTransport([
      { hits: { hits: [] } }, // anchor
      { hits: { hits: [] } }, // poll
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs', '--query', '{"match":{"level":"error"}}'], deps)

    const pollBody = requests[1]!.params.body as Record<string, unknown>
    const query = pollBody.query as Record<string, unknown>
    assert.deepEqual(query, { match: { level: 'error' } })
  })

  it('handles a transport error from the anchor gracefully', async () => {
    const io = captureOutput()
    const transport = {
      request: async () => { throw new Error('connection refused') },
    } as unknown as EsClient

    const deps = makeDeps(transport, io)
    // Command should not throw — it returns a structured error.
    await assert.doesNotReject(() => runCommand(['--index', 'logs'], deps))
  })

  it('writes a summary to stderr on stop', async () => {
    const io = captureOutput()
    const { transport } = mockTransport([
      { hits: { hits: [] } }, // anchor
      { hits: { hits: [{ _source: { n: 1 }, sort: ['t1', 'id1'] }] } },
    ])

    const deps = makeDeps(transport, io, { stopAfterPolls: 1 })
    await runCommand(['--index', 'logs'], deps)

    const stderr = io.stderr.chunks.join('')
    assert.ok(stderr.includes('1 documents') || stderr.includes('Streamed 1'), `stderr: ${stderr}`)
  })

  it('returns missing_config error when transport is not configured', async () => {
    const io = captureOutput()
    const deps: WatchDeps & { io: ReturnType<typeof captureOutput> } = {
      io,
      getEsClient: () => { throw new Error('no ES configured') },
      stdout: io.stdout,
      stderr: io.stderr,
      sleep: async () => {},
      onSignal: () => {},
      offSignal: () => {},
    }

    const program = new Command()
    program.exitOverride()
    program.addCommand(createWatchCommand(deps))

    let caughtOutput = ''
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string) => {
      caughtOutput += chunk
      return true
    }) as typeof process.stderr.write

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await program.parseAsync(['node', 'test', 'watch', '--index', 'logs'])
    } finally {
      restoreStdin()
      process.stderr.write = origWrite
      process.exitCode = 0
    }

    assert.ok(caughtOutput.includes('missing_config') || caughtOutput.includes('no ES'), `output: ${caughtOutput}`)
  })
})
