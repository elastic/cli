/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { EsClient, EsRequestParams } from '../../../src/lib/es-client.ts'
import { createBulkIngestCommand } from '../../../src/es/helpers/bulk-ingest.ts'
import type { BulkIngestDeps } from '../../../src/es/helpers/bulk-ingest.ts'
import { _testSetStdinReader } from '../../../src/factory.ts'
import { Command } from 'commander'

/** Creates a mock transport that records requests and returns configurable responses. */
function mockTransport (responses: Array<{ errors: boolean, items: Array<Record<string, { status: number }>> }>): {
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

function makeDeps (transport: EsClient): BulkIngestDeps {
  return { getEsClient: () => transport }
}

function successResponse (count: number): { errors: boolean, items: Array<Record<string, { status: number }>> } {
  return {
    errors: false,
    items: Array.from({ length: count }, () => ({ index: { status: 201 } }))
  }
}

/** A response where every item in the batch comes back errored. */
function failureResponse (count: number): { errors: boolean, items: Array<Record<string, { status: number }>> } {
  return {
    errors: true,
    items: Array.from({ length: count }, () => ({ index: { status: 500 } }))
  }
}

/** Runs the bulk-ingest command programmatically and returns handler result. */
async function runCommand (args: string[], deps: BulkIngestDeps): Promise<unknown> {
  const cmd = createBulkIngestCommand(deps)
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
    await program.parseAsync(['node', 'test', 'bulk-ingest', ...args])
  } finally {
    restoreStdin()
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exitCode = 0
  }

  // Prefer stderr (error results) over stdout; parse whichever has content.
  // Each process.stdout/stderr.write() call is its own array entry, and each
  // logical write (a progress update, a binary IPC frame from Node's test
  // runner, or the final JSON result) is a complete, self-contained chunk.
  // So scan chunks (not a joined blob, which can merge binary-frame trailing
  // bytes into the JSON chunk and break the startsWith('{') check) in
  // reverse for the last one that parses as JSON.
  const findJsonChunk = (chunks: string[]): unknown => {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const t = chunks[i]!.trim()
      if ((t.startsWith('{') || t.startsWith('[')) && t.length > 0) {
        try { return JSON.parse(t) } catch { /* not JSON, try the previous chunk */ }
      }
    }
    return undefined
  }

  const errResult = findJsonChunk(stderrChunks)
  if (errResult !== undefined) return errResult

  const outResult = findJsonChunk(stdoutChunks)
  if (outResult !== undefined) return outResult

  const errOutput = stderrChunks.join('').trim()
  if (errOutput.length > 0) return errOutput
  const stdOutput = stdoutChunks.join('').trim()
  if (stdOutput.length > 0) return stdOutput
  return undefined
}

describe('bulk-ingest command', () => {
  it('creates a command named bulk-ingest', () => {
    const { transport } = mockTransport([successResponse(1)])
    const cmd = createBulkIngestCommand(makeDeps(transport))
    assert.equal(cmd.name(), 'bulk-ingest')
  })

  it('ingests documents from --data-file with JSON array', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const filePath = join(tmpDir, 'data.json')
    writeFileSync(filePath, JSON.stringify([{ title: 'doc1' }, { title: 'doc2' }]))

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand(['--index', 'test-idx', '--data-file', filePath, '--json'], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"index"'))
    assert.ok(body.includes('"doc1"'))
    assert.ok(body.includes('"doc2"'))
  })

  it('ingests documents from --data-file with NDJSON', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const filePath = join(tmpDir, 'data.ndjson')
    writeFileSync(filePath, '{"title":"doc1"}\n{"title":"doc2"}\n')

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand(['--index', 'test-idx', '--data-file', filePath, '--json'], makeDeps(transport))

    assert.equal(requests.length, 1)
  })

  it('ingests documents from --data-dir', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'a.json'), '[{"a":1}]')
    writeFileSync(join(tmpDir, 'b.json'), '[{"b":2}]')

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand([
      '--index', 'test-idx',
      '--data-dir', tmpDir,
      '--glob', '*.json',
      '--json'
    ], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"a"'))
    assert.ok(body.includes('"b"'))
  })

  it('ingests .ndjson files from --data-dir without an explicit --glob', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-ndjson-'))
    writeFileSync(join(tmpDir, 'a.ndjson'), '{"x":1}\n{"x":2}\n')

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand([
      '--index', 'test-idx',
      '--data-dir', tmpDir,
      '--json'
    ], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"x"'), 'expected .ndjson file to be picked up by default glob')
  })

  it('ingests .jsonl files from --data-dir without an explicit --glob', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-jsonl-'))
    writeFileSync(join(tmpDir, 'a.jsonl'), '{"y":1}\n{"y":2}\n')

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand([
      '--index', 'test-idx',
      '--data-dir', tmpDir,
      '--json'
    ], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"y"'), 'expected .jsonl file to be picked up by default glob')
  })

  it('recurses into subdirectories by default', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    mkdirSync(join(tmpDir, 'sub'))
    writeFileSync(join(tmpDir, 'top.json'), '[{"top":1}]')
    writeFileSync(join(tmpDir, 'sub', 'nested.json'), '[{"nested":2}]')

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand([
      '--index', 'test-idx',
      '--data-dir', tmpDir,
      '--json'
    ], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"top"'))
    assert.ok(body.includes('"nested"'))
  })

  it('splits large inputs into multiple batches', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const docs = Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify(docs))

    // Use a small flush-bytes to force multiple batches
    const { transport, requests } = mockTransport(
      Array.from({ length: 100 }, () => successResponse(1))
    )

    await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--flush-bytes', '500',
      '--json'
    ], makeDeps(transport))

    assert.ok(requests.length > 1, `Expected multiple batches, got ${requests.length}`)
  })

  it('includes pipeline and routing in bulk actions', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1}]')

    const { transport, requests } = mockTransport([successResponse(1)])

    await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--pipeline', 'my-pipe',
      '--routing', 'shard-1',
      '--json'
    ], makeDeps(transport))

    const body = requests[0]!.params.body as string
    const actionLine = JSON.parse(body.split('\n')[0]!)
    assert.equal(actionLine.index.pipeline, 'my-pipe')
    assert.equal(actionLine.index.routing, 'shard-1')
  })

  it('returns missing_config error when transport is not configured', async () => {
    const deps: BulkIngestDeps = {
      getEsClient: () => { throw new Error('missing_config: no ES configured') }
    }
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1}]')

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], deps) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'missing_config')
  })

  it('delegates the NDJSON content-type to EsClient bulkBody handling', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1}]')

    const { transport, requests } = mockTransport([successResponse(1)])

    await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], makeDeps(transport))

    assert.equal(requests[0]!.params.bulkBody, requests[0]!.params.body)
    assert.equal(requests[0]!.opts, undefined)
  })

  it('streams a pretty-printed, multi-line JSON array', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify([{ title: 'doc1' }, { title: 'doc2' }], null, 2))

    const { transport, requests } = mockTransport([successResponse(2)])

    await runCommand(['--index', 'test-idx', '--data-file', join(tmpDir, 'data.json'), '--json'], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"doc1"'))
    assert.ok(body.includes('"doc2"'))
  })

  it('streams a minified JSON array with multiple documents on one line', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1},{"b":2},{"c":3}]')

    const { transport, requests } = mockTransport([successResponse(3)])

    await runCommand(['--index', 'test-idx', '--data-file', join(tmpDir, 'data.json'), '--json'], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    assert.ok(body.includes('"a"') && body.includes('"b"') && body.includes('"c"'))
  })

  it('splits a JSON array into separate documents regardless of --source-format (ndjson vs json is decorative)', async () => {
    const docs = [{ title: 'doc1' }, { title: 'doc2' }]

    for (const sourceFormat of ['ndjson', 'json'] as const) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
      writeFileSync(join(tmpDir, 'data.json'), JSON.stringify(docs))

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', join(tmpDir, 'data.json'),
        '--source-format', sourceFormat,
        '--json'
      ], makeDeps(transport))

      assert.equal(requests.length, 1)
      const body = requests[0]!.params.body as string
      const docLines = body.trim().split('\n').filter((_, i) => i % 2 === 1)
      assert.deepStrictEqual(
        docLines.map((l) => JSON.parse(l)),
        docs,
        `expected two separate documents with --source-format ${sourceFormat}, not the array as one doc`
      )
    }
  })

  it('parses an NDJSON file the same way whether --source-format is ndjson or json', async () => {
    const docs = [{ title: 'doc1' }, { title: 'doc2' }]

    for (const sourceFormat of ['ndjson', 'json'] as const) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
      writeFileSync(join(tmpDir, 'data.ndjson'), docs.map((d) => JSON.stringify(d)).join('\n') + '\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', join(tmpDir, 'data.ndjson'),
        '--source-format', sourceFormat,
        '--json'
      ], makeDeps(transport))

      assert.equal(requests.length, 1)
      const body = requests[0]!.params.body as string
      const docLines = body.trim().split('\n').filter((_, i) => i % 2 === 1)
      assert.deepStrictEqual(
        docLines.map((l) => JSON.parse(l)),
        docs,
        `expected NDJSON to parse the same way with --source-format ${sourceFormat}`
      )
    }
  })

  it('correctly splits JSON array elements containing commas and brackets inside strings', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const docs = [
      { note: 'contains a, comma and a ] bracket' },
      { note: 'contains an escaped \\" quote' },
      { nested: { arr: [1, 2, { deep: true }] } }
    ]
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify(docs))

    const { transport, requests } = mockTransport([successResponse(3)])

    await runCommand(['--index', 'test-idx', '--data-file', join(tmpDir, 'data.json'), '--json'], makeDeps(transport))

    assert.equal(requests.length, 1)
    const body = requests[0]!.params.body as string
    const lines = body.trim().split('\n').filter((_, i) => i % 2 === 1) // doc lines only
    assert.deepStrictEqual(lines.map((l) => JSON.parse(l)), docs)
  })

  it('rejects a JSON array that is never closed', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1},{"b":2}')

    const { transport } = mockTransport([successResponse(1)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'input_error')
    assert.match(error.message as string, /not closed/)
  })

  it('rejects an unparseable element inside a JSON array', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1}, not-json, {"b":2}]')

    const { transport } = mockTransport([successResponse(1)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'input_error')
    assert.match(error.message as string, /Failed to parse JSON array element/)
  })

  it('streams an empty JSON array without sending any batch', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[]')

    const { transport, requests } = mockTransport([successResponse(0)])

    await runCommand(['--index', 'test-idx', '--data-file', join(tmpDir, 'data.json'), '--json'], makeDeps(transport))

    assert.equal(requests.length, 0)
  })

  it('counts a fully-failed batch instead of dropping it from the summary', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify([{ a: 1 }, { a: 2 }]))

    const { transport } = mockTransport([failureResponse(2)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--retries', '0',
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.equal(result.total, 2)
    assert.equal(result.failed, 2)
    assert.equal(result.succeeded, 0)
    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'transport_error')
    assert.match(error.message as string, /2 doc\(s\) dropped/)
  })

  it('surfaces every failed batch, not just the first', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const docs = Array.from({ length: 4 }, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify(docs))

    // Small flush-bytes forces multiple batches; every batch fails.
    const { transport, requests } = mockTransport([failureResponse(1)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--flush-bytes', '50',
      '--retries', '0',
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.ok(requests.length > 1, `expected multiple batches, got ${requests.length}`)
    const error = result.error as Record<string, unknown>
    const dropMentions = (error.message as string).split('doc(s) dropped').length - 1
    assert.equal(dropMentions, requests.length, 'expected every failed batch to be mentioned, not just the first')
  })

  it('reports partial progress when a later batch fails', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const docs = Array.from({ length: 2 }, (_, i) => ({ id: i, data: 'x'.repeat(100) }))
    writeFileSync(join(tmpDir, 'data.json'), JSON.stringify(docs))

    // First batch succeeds, second fails.
    const { transport } = mockTransport([successResponse(1), failureResponse(1)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--flush-bytes', '50',
      '--retries', '0',
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.equal(result.total, 2)
    assert.equal(result.succeeded, 1)
    assert.equal(result.failed, 1)
    assert.ok(result.error != null)
  })

  it('reports input_error, not transport_error, for a missing --data-file', async () => {
    const { transport } = mockTransport([successResponse(0)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', '/tmp/does-not-exist-bulk-ingest-test.ndjson',
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'input_error')
    assert.match(error.message as string, /ENOENT/)
  })

  it('rejects an empty --data-file as input_error, not a silent success', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const filePath = join(tmpDir, 'empty.ndjson')
    writeFileSync(filePath, '')

    const { transport, requests } = mockTransport([successResponse(0)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', filePath,
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.equal(requests.length, 0)
    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'input_error')
    assert.match(error.message as string, /No input data received/)
  })

  it('rejects whitespace-only --data-file as input_error', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const filePath = join(tmpDir, 'whitespace.ndjson')
    writeFileSync(filePath, '   \n\n  \n')

    const { transport } = mockTransport([successResponse(0)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', filePath,
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    const error = result.error as Record<string, unknown>
    assert.equal(error.code, 'input_error')
    assert.match(error.message as string, /No input data received/)
  })

  it('does not treat a valid empty JSON array `[]` as an input_error', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    const filePath = join(tmpDir, 'data.json')
    writeFileSync(filePath, '[]')

    const { transport } = mockTransport([successResponse(0)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', filePath,
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.equal(result.error, undefined)
    assert.equal(result.total, 0)
  })

  it('returns empty summary for zero documents', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[]')

    const { transport } = mockTransport([successResponse(0)])

    const result = await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], makeDeps(transport)) as Record<string, unknown>

    assert.equal(result.total, 0)
    assert.equal(result.succeeded, 0)
  })

  describe('CSV ingestion', () => {
    it('ingests a CSV file with a header row', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'data.csv')
      writeFileSync(filePath, 'name,age,city\nAlice,30,London\nBob,25,Paris\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--json'
      ], makeDeps(transport))

      assert.equal(requests.length, 1)
      const body = requests[0]!.params.body as string
      const lines = body.trim().split('\n')
      const doc1 = JSON.parse(lines[1]!)
      const doc2 = JSON.parse(lines[3]!)
      assert.equal(doc1.name, 'Alice')
      assert.equal(doc1.age, 30)
      assert.equal(doc1.city, 'London')
      assert.equal(doc2.name, 'Bob')
      assert.equal(doc2.age, 25)
    })

    it('uses custom delimiter with --csv-delimiter', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'data.csv')
      writeFileSync(filePath, 'name;score\nAlice;42\nBob;99\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--csv-delimiter', ';',
        '--json'
      ], makeDeps(transport))

      const body = requests[0]!.params.body as string
      const doc = JSON.parse(body.trim().split('\n')[1]!)
      assert.equal(doc.name, 'Alice')
      assert.equal(doc.score, 42)
    })

    it('accepts explicit column names via --csv-columns (no header row)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'data.csv')
      writeFileSync(filePath, 'Alice,30\nBob,25\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--csv-columns', 'name,age',
        '--json'
      ], makeDeps(transport))

      const body = requests[0]!.params.body as string
      const doc = JSON.parse(body.trim().split('\n')[1]!)
      assert.equal(doc.name, 'Alice')
      assert.equal(doc.age, 30)
    })

    it('skips the header row with --skip-header and renames columns', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'data.csv')
      writeFileSync(filePath, 'old_name,old_age\nAlice,30\nBob,25\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--skip-header',
        '--csv-columns', 'name,age',
        '--json'
      ], makeDeps(transport))

      const body = requests[0]!.params.body as string
      const lines = body.trim().split('\n')
      assert.equal(lines.length, 4, 'Expected 2 doc pairs (4 lines)')
      const doc1 = JSON.parse(lines[1]!)
      assert.equal(doc1.name, 'Alice')
      assert.ok(!Object.keys(doc1).includes('old_name'), 'old header names should not appear')
    })

    it('ingests CSV files from --data-dir using default glob', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      writeFileSync(join(tmpDir, 'a.csv'), 'id,val\n1,foo\n')
      writeFileSync(join(tmpDir, 'b.csv'), 'id,val\n2,bar\n')

      const { transport, requests } = mockTransport([successResponse(2)])

      await runCommand([
        '--index', 'test-idx',
        '--data-dir', tmpDir,
        '--source-format', 'csv',
        '--json'
      ], makeDeps(transport))

      assert.equal(requests.length, 1)
      const body = requests[0]!.params.body as string
      assert.ok(body.includes('"foo"'))
      assert.ok(body.includes('"bar"'))
    })

    it('reports input_error instead of crashing on a missing CSV file', async () => {
      const { transport } = mockTransport([successResponse(0)])

      const result = await runCommand([
        '--index', 'test-idx',
        '--data-file', '/tmp/does-not-exist-bulk-ingest-test.csv',
        '--source-format', 'csv',
        '--json'
      ], makeDeps(transport)) as Record<string, unknown>

      const error = result.error as Record<string, unknown>
      assert.equal(error.code, 'input_error')
      assert.match(error.message as string, /ENOENT/)
    })

    it('does not treat a header-only CSV (zero data rows) as input_error', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'headers-only.csv')
      writeFileSync(filePath, 'name,age\n')

      const { transport } = mockTransport([successResponse(0)])

      const result = await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--json'
      ], makeDeps(transport)) as Record<string, unknown>

      assert.equal(result.error, undefined)
      assert.equal(result.total, 0)
    })

    it('casts numeric and boolean values from CSV', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-csv-'))
      const filePath = join(tmpDir, 'data.csv')
      writeFileSync(filePath, 'id,active,score\n1,true,3.14\n')

      const { transport, requests } = mockTransport([successResponse(1)])

      await runCommand([
        '--index', 'test-idx',
        '--data-file', filePath,
        '--source-format', 'csv',
        '--json'
      ], makeDeps(transport))

      const body = requests[0]!.params.body as string
      const doc = JSON.parse(body.trim().split('\n')[1]!)
      assert.strictEqual(doc.id, 1)
      assert.strictEqual(doc.active, true)
      assert.strictEqual(doc.score, 3.14)
    })
  })
})
