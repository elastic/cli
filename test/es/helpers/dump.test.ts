/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, openSync, fstatSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { EsClient, EsRequestParams } from '../../../src/lib/es-client.ts'
import { createDumpCommand, abortDump } from '../../../src/es/helpers/dump.ts'
import type { DumpDeps } from '../../../src/es/helpers/dump.ts'
import { _testSetStdinReader } from '../../../src/factory.ts'
import { Command } from 'commander'

interface PitResponse { id: string }
interface Hit { _id: string; _source: unknown; sort: unknown[] }
interface SearchResponse { pit_id: string; hits: { hits: Hit[] } }

type MockResponse = PitResponse | SearchResponse | Record<string, never>

function mockTransport (responses: MockResponse[]): {
  transport: EsClient
  requests: Array<{ params: EsRequestParams }>
} {
  const requests: Array<{ params: EsRequestParams }> = []
  let callIndex = 0
  const transport = {
    request: async (params: EsRequestParams) => {
      requests.push({ params })
      const response = responses[callIndex] ?? {}
      callIndex++
      return response
    }
  } as unknown as EsClient
  return { transport, requests }
}

function captureIO (): { stdout: { write: (s: string) => boolean, chunks: string[] }, stderr: { write: (s: string) => boolean, chunks: string[] } } {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  return {
    stdout: { chunks: stdoutChunks, write: (s) => { stdoutChunks.push(s); return true } },
    stderr: { chunks: stderrChunks, write: (s) => { stderrChunks.push(s); return true } }
  }
}

function makeDeps (transport: EsClient, io?: ReturnType<typeof captureIO>): DumpDeps {
  const channel = io ?? captureIO()
  return { getEsClient: () => transport, stdout: channel.stdout, stderr: channel.stderr }
}

async function runCommand (args: string[], deps: DumpDeps): Promise<{ stdout: string, stderr: string, programOut: string, programErr: string }> {
  const cmd = createDumpCommand(deps)
  const program = new Command()
  program.exitOverride()
  program.option('--json', 'output as JSON')
  program.addCommand(cmd)

  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  const progOut: string[] = []
  const progErr: string[] = []
  process.stdout.write = ((chunk: string) => { progOut.push(typeof chunk === 'string' ? chunk : chunk.toString()); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => { progErr.push(typeof chunk === 'string' ? chunk : chunk.toString()); return true }) as typeof process.stderr.write

  const restoreStdin = _testSetStdinReader(() => '')
  try {
    await program.parseAsync(['node', 'test', 'dump', ...args])
  } finally {
    restoreStdin()
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exitCode = 0
  }

  const depStdout = (deps.stdout as { chunks: string[] }).chunks ?? []
  const depStderr = (deps.stderr as { chunks: string[] }).chunks ?? []
  return {
    stdout: depStdout.join(''),
    stderr: depStderr.join(''),
    programOut: progOut.join(''),
    programErr: progErr.join('')
  }
}

describe('dump command', () => {
  it('creates a command named dump', () => {
    const { transport } = mockTransport([])
    const cmd = createDumpCommand(makeDeps(transport))
    assert.equal(cmd.name(), 'dump')
  })

  it('opens a PIT, paginates with search_after, and streams bulk-format NDJSON to stdout', async () => {
    const io = captureIO()
    const { transport, requests } = mockTransport([
      // open_point_in_time
      { id: 'pit-1' },
      // initial search
      {
        pit_id: 'pit-2',
        hits: { hits: [
          { _id: 'a', _source: { v: 1 }, sort: [10] },
          { _id: 'b', _source: { v: 2 }, sort: [20] },
        ] }
      },
      // second page
      {
        pit_id: 'pit-3',
        hits: { hits: [
          { _id: 'c', _source: { v: 3 }, sort: [30] },
        ] }
      },
      // empty page
      { pit_id: 'pit-3', hits: { hits: [] } },
      // close_point_in_time
      {}
    ])

    await runCommand(['--indices', 'my-idx'], makeDeps(transport, io))

    const lines = io.stdout.chunks.join('').split('\n').filter((l) => l.length > 0)
    assert.equal(lines.length, 6, `expected 6 NDJSON lines (3 action + 3 doc), got: ${lines.length}`)
    assert.deepStrictEqual(JSON.parse(lines[0]!), { index: { _index: 'my-idx' } })
    assert.deepStrictEqual(JSON.parse(lines[1]!), { v: 1 })
    assert.deepStrictEqual(JSON.parse(lines[2]!), { index: { _index: 'my-idx' } })
    assert.deepStrictEqual(JSON.parse(lines[3]!), { v: 2 })
    assert.deepStrictEqual(JSON.parse(lines[4]!), { index: { _index: 'my-idx' } })
    assert.deepStrictEqual(JSON.parse(lines[5]!), { v: 3 })

    // PIT open + 3 searches + PIT close = 5
    assert.equal(requests.length, 5)
    assert.equal(requests[0]!.params.method, 'POST')
    assert.ok(requests[0]!.params.path.includes('_pit'))

    const initialBody = requests[1]!.params.body as Record<string, unknown>
    assert.equal(initialBody.size, 500)
    assert.deepStrictEqual(initialBody.query, { match_all: {} })
    assert.deepStrictEqual(initialBody.sort, [{ _shard_doc: 'asc' }])
    assert.equal((initialBody.pit as { id: string }).id, 'pit-1')

    const secondBody = requests[2]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(secondBody.search_after, [20])
    assert.equal((secondBody.pit as { id: string }).id, 'pit-2')

    const closeReq = requests[4]!
    assert.equal(closeReq.params.method, 'DELETE')
    assert.ok(closeReq.params.path.includes('_pit'))
    assert.deepStrictEqual(closeReq.params.body, { id: 'pit-3' })
  })

  it('respects --size and --keep-alive', async () => {
    const io = captureIO()
    const { transport, requests } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx', '--size', '50', '--keep-alive', '5m'], makeDeps(transport, io))

    const pitOpen = requests[0]!.params
    assert.equal((pitOpen.querystring as Record<string, unknown>).keep_alive, '5m')

    const search = requests[1]!.params.body as Record<string, unknown>
    assert.equal(search.size, 50)
    assert.equal((search.pit as { keep_alive: string }).keep_alive, '5m')
  })

  it('emits {"index":{}} when --skip-index-name is set', async () => {
    const io = captureIO()
    const { transport } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { v: 1 }, sort: [1] }] } },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'my-idx', '--skip-index-name'], makeDeps(transport, io))

    const lines = io.stdout.chunks.join('').split('\n').filter((l) => l.length > 0)
    assert.deepStrictEqual(JSON.parse(lines[0]!), { index: {} })
    assert.deepStrictEqual(JSON.parse(lines[1]!), { v: 1 })
  })

  it('emits _id in action lines when --add-id is set', async () => {
    const io = captureIO()
    const { transport } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { v: 1 }, sort: [1] }] } },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'my-idx', '--add-id'], makeDeps(transport, io))

    const lines = io.stdout.chunks.join('').split('\n').filter((l) => l.length > 0)
    const action = JSON.parse(lines[0]!) as { index: Record<string, string> }
    assert.equal(action.index._id, 'a')
    assert.equal(action.index._index, 'my-idx')
  })

  it('reads --query JSON from a file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'dump-test-'))
    const queryPath = join(tmpDir, 'q.json')
    writeFileSync(queryPath, '{"term":{"status":"active"}}')

    const io = captureIO()
    const { transport, requests } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx', '--query-file', queryPath], makeDeps(transport, io))

    const body = requests[1]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(body.query, { term: { status: 'active' } })
  })

  it('reads --query JSON inline', async () => {
    const io = captureIO()
    const { transport, requests } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx', '--query', '{"match":{"f":"v"}}'], makeDeps(transport, io))

    const body = requests[1]!.params.body as Record<string, unknown>
    assert.deepStrictEqual(body.query, { match: { f: 'v' } })
  })

  it('writes NDJSON to --output file when provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'dump-test-'))
    const outPath = join(tmpDir, 'out.ndjson')

    const io = captureIO()
    const { transport } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { v: 1 }, sort: [1] }] } },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx', '--output', outPath], makeDeps(transport, io))

    const fileContent = readFileSync(outPath, 'utf-8')
    const lines = fileContent.split('\n').filter((l) => l.length > 0)
    assert.equal(lines.length, 2)
    assert.deepStrictEqual(JSON.parse(lines[0]!), { index: { _index: 'idx' } })
    assert.deepStrictEqual(JSON.parse(lines[1]!), { v: 1 })

    // NDJSON should not be in deps.stdout when --output is set
    assert.equal(io.stdout.chunks.length, 0)
  })

  it('dumps multiple indices with separate PITs', async () => {
    const io = captureIO()
    const { transport, requests } = mockTransport([
      // idx1
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { i: 1 }, sort: [1] }] } },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {},
      // idx2
      { id: 'pit-2' },
      { pit_id: 'pit-2', hits: { hits: [{ _id: 'b', _source: { i: 2 }, sort: [1] }] } },
      { pit_id: 'pit-2', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx1,idx2'], makeDeps(transport, io))

    const lines = io.stdout.chunks.join('').split('\n').filter((l) => l.length > 0)
    assert.equal(lines.length, 4)
    assert.deepStrictEqual(JSON.parse(lines[0]!), { index: { _index: 'idx1' } })
    assert.deepStrictEqual(JSON.parse(lines[2]!), { index: { _index: 'idx2' } })

    // pit-1 open targets idx1
    assert.ok(requests[0]!.params.path.includes('idx1'))
    // pit-2 open targets idx2
    assert.ok(requests[4]!.params.path.includes('idx2'))
  })

  it('closes the PIT on transport error mid-pagination', async () => {
    const io = captureIO()
    let deleteCount = 0
    let searchCount = 0
    const transport = {
      request: async (params: EsRequestParams) => {
        if (params.method === 'DELETE' && params.path.includes('_pit')) {
          deleteCount++
          return {}
        }
        if (params.path.includes('_pit') && params.method === 'POST') {
          return { id: 'pit-err' }
        }
        if (params.path.includes('_search')) {
          searchCount++
          if (searchCount === 1) {
            return { pit_id: 'pit-err', hits: { hits: [{ _id: 'a', _source: { v: 1 }, sort: [1] }] } }
          }
          throw new Error('boom')
        }
        return {}
      }
    } as unknown as EsClient

    await runCommand(['--indices', 'idx'], makeDeps(transport, io))

    assert.equal(deleteCount, 1, 'PIT must be closed on transport error')
  })

  it('returns missing_config error when ES is not configured', async () => {
    const io = captureIO()
    const deps: DumpDeps = {
      getEsClient: () => { throw new Error('missing_config: no ES configured') },
      stdout: io.stdout,
      stderr: io.stderr
    }

    const { programOut, programErr } = await runCommand(['--indices', 'idx', '--json'], deps)
    const payload = JSON.parse((programErr.trim() || programOut.trim())) as Record<string, unknown>
    const err = payload.error as Record<string, unknown>
    assert.equal(err.code, 'missing_config')
  })

  it('errors when --query-file is empty', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'dump-test-'))
    const queryPath = join(tmpDir, 'empty.json')
    writeFileSync(queryPath, '')

    const io = captureIO()
    const { transport } = mockTransport([])
    const { programOut, programErr } = await runCommand(
      ['--indices', 'idx', '--query-file', queryPath, '--output', join(tmpDir, 'out.ndjson'), '--json'],
      makeDeps(transport, io)
    )
    const payload = JSON.parse(programErr.trim() || programOut.trim()) as Record<string, unknown>
    const err = payload.error as Record<string, unknown>
    assert.equal(err.code, 'input_error')
  })

  it('returns transport_error when PIT response is missing id', async () => {
    const io = captureIO()
    const { transport } = mockTransport([
      // PIT response without id
      {},
    ])
    const tmpDir = mkdtempSync(join(tmpdir(), 'dump-test-'))
    const { programOut, programErr } = await runCommand(
      ['--indices', 'idx', '--output', join(tmpDir, 'out.ndjson'), '--json'],
      makeDeps(transport, io)
    )
    const payload = JSON.parse(programErr.trim() || programOut.trim()) as Record<string, unknown>
    const err = payload.error as Record<string, unknown>
    assert.equal(err.code, 'transport_error')
  })

  it('rejects --json when --output is not provided', async () => {
    const io = captureIO()
    const { transport } = mockTransport([])
    const { programOut, programErr } = await runCommand(
      ['--indices', 'idx', '--json'],
      makeDeps(transport, io)
    )
    const payload = JSON.parse(programErr.trim() || programOut.trim()) as Record<string, unknown>
    const err = payload.error as Record<string, unknown>
    assert.equal(err.code, 'input_error')
    assert.match(err.message as string, /--json requires --output/)
  })

  it('stops paginating when the last hit has no sort value', async () => {
    const io = captureIO()
    const { transport } = mockTransport([
      { id: 'pit-1' },
      // single page, hit lacks `sort` → loop must break instead of dereferencing undefined
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { v: 1 } }] } },
      {}
    ])
    await runCommand(['--indices', 'idx'], makeDeps(transport, io))
    const lines = io.stdout.chunks.join('').split('\n').filter((l) => l.length > 0)
    assert.equal(lines.length, 2)
  })

  it('writes a summary line to stderr', async () => {
    const io = captureIO()
    const { transport } = mockTransport([
      { id: 'pit-1' },
      { pit_id: 'pit-1', hits: { hits: [{ _id: 'a', _source: { v: 1 }, sort: [1] }] } },
      { pit_id: 'pit-1', hits: { hits: [] } },
      {}
    ])

    await runCommand(['--indices', 'idx'], makeDeps(transport, io))

    const text = io.stderr.chunks.join('')
    assert.ok(/1\s+document/i.test(text) || text.includes('1'), `expected stderr to mention 1 document, got: ${text}`)
  })
})

describe('abortDump (SIGINT/SIGTERM cleanup)', () => {
  it('closes the open fd and DELETEs the active PIT', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'dump-abort-'))
    const fd = openSync(join(tmpDir, 'partial.ndjson'), 'w')

    const requests: Array<{ params: EsRequestParams }> = []
    const transport = {
      request: async (params: EsRequestParams) => {
        requests.push({ params })
        return {}
      }
    } as unknown as EsClient

    const refs = { pitId: 'pit-mid-dump', fd }
    await abortDump(transport, refs)

    assert.equal(refs.pitId, null)
    assert.equal(refs.fd, null)
    assert.equal(requests.length, 1)
    assert.equal(requests[0]!.params.method, 'DELETE')
    assert.ok(requests[0]!.params.path.includes('_pit'))
    assert.deepStrictEqual(requests[0]!.params.body, { id: 'pit-mid-dump' })

    // fd should be closed: fstatSync on a closed fd throws
    assert.throws(() => fstatSync(fd))
  })

  it('is a no-op when no resources are active', async () => {
    const requests: Array<{ params: EsRequestParams }> = []
    const transport = {
      request: async (params: EsRequestParams) => { requests.push({ params }); return {} }
    } as unknown as EsClient

    const refs = { pitId: null, fd: null }
    await abortDump(transport, refs)
    assert.equal(requests.length, 0)
  })

  it('swallows DELETE failures (best effort)', async () => {
    const transport = {
      request: async () => { throw new Error('network down') }
    } as unknown as EsClient
    const refs = { pitId: 'pit-x', fd: null }
    await assert.doesNotReject(() => abortDump(transport, refs))
    assert.equal(refs.pitId, null)
  })

  it('clears pitId before awaiting DELETE so concurrent aborts do not double-close', async () => {
    let resolveRequest: () => void = () => {}
    const requests: EsRequestParams[] = []
    const transport = {
      request: async (params: EsRequestParams) => {
        requests.push(params)
        await new Promise<void>((r) => { resolveRequest = r })
        return {}
      }
    } as unknown as EsClient

    const refs = { pitId: 'pit-1', fd: null }
    const first = abortDump(transport, refs)
    // While the first DELETE is in flight, a second abort must not re-issue it.
    const second = abortDump(transport, refs)
    resolveRequest()
    await Promise.all([first, second])
    assert.equal(requests.length, 1)
  })
})
