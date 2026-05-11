/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Transport, TransportRequestParams, TransportRequestOptions } from '@elastic/transport'
import { createBulkIngestCommand } from '../../../src/es/helpers/bulk-ingest.ts'
import type { BulkIngestDeps } from '../../../src/es/helpers/bulk-ingest.ts'
import { _testSetStdinReader } from '../../../src/factory.ts'
import { Command } from 'commander'

/** Creates a mock transport that records requests and returns configurable responses. */
function mockTransport (responses: Array<{ errors: boolean, items: Array<Record<string, { status: number }>> }>): {
  transport: Transport
  requests: Array<{ params: TransportRequestParams, opts?: TransportRequestOptions }>
} {
  const requests: Array<{ params: TransportRequestParams, opts?: TransportRequestOptions }> = []
  let callIndex = 0
  const transport = {
    request: async (params: TransportRequestParams, opts?: TransportRequestOptions) => {
      requests.push({ params, opts })
      const response = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return response
    }
  } as unknown as Transport
  return { transport, requests }
}

function makeDeps (transport: Transport): BulkIngestDeps {
  return { getTransport: () => transport }
}

function successResponse (count: number): { errors: boolean, items: Array<Record<string, { status: number }>> } {
  return {
    errors: false,
    items: Array.from({ length: count }, () => ({ index: { status: 201 } }))
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

  // Prefer stderr (error results) over stdout; parse whichever has content
  const errOutput = stderrChunks.join('')
  const stdOutput = stdoutChunks.join('')
  const output = errOutput.trim().length > 0 ? errOutput : stdOutput
  if (output.trim().length > 0) {
    try {
      return JSON.parse(output.trim())
    } catch {
      return output.trim()
    }
  }
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
      getTransport: () => { throw new Error('missing_config: no ES configured') }
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

  it('sends content-type application/x-ndjson header', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bulk-test-'))
    writeFileSync(join(tmpDir, 'data.json'), '[{"a":1}]')

    const { transport, requests } = mockTransport([successResponse(1)])

    await runCommand([
      '--index', 'test-idx',
      '--data-file', join(tmpDir, 'data.json'),
      '--json'
    ], makeDeps(transport))

    const opts = requests[0]!.opts as Record<string, unknown>
    const headers = opts.headers as Record<string, string>
    assert.equal(headers['content-type'], 'application/x-ndjson')
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
