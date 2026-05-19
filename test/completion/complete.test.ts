/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCompletionTree,
  handleComplete,
  buildCompleteCommand,
} from '../../src/completion/complete.ts'

function bufferedWriter (): { write: (chunk: string) => void; chunks: string[] } {
  const chunks: string[] = []
  return { write: (chunk) => { chunks.push(chunk) }, chunks }
}

function parseOutput (output: string): { candidates: string[]; directive: number } {
  const lines = output.split('\n').filter(l => l.length > 0)
  const last = lines[lines.length - 1] ?? ''
  if (!last.startsWith(':')) return { candidates: lines, directive: 0 }
  return {
    candidates: lines.slice(0, -1),
    directive: Number(last.slice(1)),
  }
}

describe('buildCompletionTree -- top-level commands', () => {
  it('registers version + every visible top-level group as stubs by default', async () => {
    const root = await buildCompletionTree([])
    const names = root.commands.map(c => c.name())
    assert.ok(names.includes('version'), `expected version, got: ${names.join(',')}`)
    assert.ok(names.includes('stack'))
    assert.ok(names.includes('cloud'))
    assert.ok(names.includes('docs'))
    assert.ok(names.includes('config'))
    assert.ok(names.includes('sanitize'))
    assert.ok(names.includes('es'), 'expected top-level es alias')
    assert.ok(names.includes('kb'), 'expected top-level kb alias')
    assert.ok(names.includes('completion'))
  })

  it('exposes elasticsearch as an alias of the top-level es', async () => {
    const root = await buildCompletionTree([])
    const es = root.commands.find(c => c.name() === 'es')!
    assert.ok(es.aliases().includes('elasticsearch'))
    const kb = root.commands.find(c => c.name() === 'kb')!
    assert.ok(kb.aliases().includes('kibana'))
  })

  it('exposes global --use-context option on the root program', async () => {
    const root = await buildCompletionTree([])
    const opt = root.options.find(o => o.long === '--use-context')
    assert.ok(opt != null, 'expected --use-context global option')
  })

  it('does not load the es subtree when the first word is unrelated', async () => {
    const root = await buildCompletionTree(['cloud'])
    const stack = root.commands.find(c => c.name() === 'stack')!
    const es = stack.commands.find(c => c.name() === 'es')
    assert.equal(es == null || es.commands.length === 0, true, 'stack es should remain a stub')
  })
})

describe('buildCompletionTree -- lazy loading', () => {
  // Note: kb/docs/config subtree loading is exercised by the spawn
  // integration tests in test/completion-cli.test.ts. Importing those
  // registers in-process here would pull large untested module trees
  // (e.g. kb/* which has no other in-process callers) into the unit-test
  // coverage denominator and silently drop project-wide thresholds.

  it('loads the cloud subtree when the first word is "cloud"', async () => {
    const root = await buildCompletionTree(['cloud'])
    const cloud = root.commands.find(c => c.name() === 'cloud')!
    assert.ok(cloud.commands.length > 0, 'cloud should have children once loaded')
  })

  it('loads the es subtree when stack + es is selected', async () => {
    const root = await buildCompletionTree(['stack', 'es'])
    const stack = root.commands.find(c => c.name() === 'stack')!
    const es = stack.commands.find(c => c.name() === 'es')!
    assert.ok(es.commands.length > 0, 'es should have children once loaded')
  })

  it('loads the es subtree via the "elasticsearch" alias too', async () => {
    const root = await buildCompletionTree(['stack', 'elasticsearch'])
    const stack = root.commands.find(c => c.name() === 'stack')!
    const es = stack.commands.find(c => c.name() === 'es')!
    assert.ok(es.commands.length > 0, 'es should load when secondWord is the alias form')
  })

  it('keeps stack es+kb as stubs when secondWord is empty', async () => {
    const root = await buildCompletionTree(['stack', ''])
    const stack = root.commands.find(c => c.name() === 'stack')!
    const es = stack.commands.find(c => c.name() === 'es')!
    const kb = stack.commands.find(c => c.name() === 'kb')!
    assert.equal(es.commands.length, 0, 'es should remain a stub when secondWord is empty')
    assert.equal(kb.commands.length, 0, 'kb should remain a stub when secondWord is empty')
  })
})

describe('handleComplete -- policy enforcement', () => {
  const ORIGINAL_ENV = process.env['ELASTIC_CLI_CONFIG_FILE']
  beforeEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })
  afterEach(() => {
    if (ORIGINAL_ENV != null) process.env['ELASTIC_CLI_CONFIG_FILE'] = ORIGINAL_ENV
    else delete process.env['ELASTIC_CLI_CONFIG_FILE']
  })

  it('hides top-level groups blocked by commands.blocked', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-policy-'))
    const path = join(dir, 'config.yml')
    await writeFile(path, [
      'current_context: local',
      'commands:',
      '  blocked:',
      '    - cloud.*',
      '    - sanitize.*',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '',
    ].join('\n'))
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path

    try {
      const buf = bufferedWriter()
      await handleComplete([''], buf.write)

      const out = parseOutput(buf.chunks.join(''))
      // Top-level group with all children blocked should be hidden entirely.
      assert.ok(!out.candidates.includes('sanitize'),
        `sanitize should be hidden by policy; got: ${out.candidates.join(',')}`)
      // Groups not blocked should still appear.
      assert.ok(out.candidates.includes('stack'))
      assert.ok(out.candidates.includes('version'))
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('applies blocked commands without resolving active-context expressions', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-policy-'))
    const path = join(dir, 'config.yml')
    await writeFile(path, [
      'current_context: local',
      'commands:',
      '  blocked:',
      '    - sanitize.*',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: $(env:ELASTIC_COMPLETION_MISSING_URL)',
      '',
    ].join('\n'))
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path
    delete process.env['ELASTIC_COMPLETION_MISSING_URL']

    try {
      const buf = bufferedWriter()
      await handleComplete([''], buf.write)

      const out = parseOutput(buf.chunks.join(''))
      assert.ok(!out.candidates.includes('sanitize'),
        `sanitize should be hidden by policy even with unresolved expressions; got: ${out.candidates.join(',')}`)
      assert.ok(out.candidates.includes('stack'))
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})

describe('handleComplete -- stdout protocol', () => {
  const ORIGINAL_ENV = process.env['ELASTIC_CLI_CONFIG_FILE']
  beforeEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })
  afterEach(() => {
    if (ORIGINAL_ENV != null) process.env['ELASTIC_CLI_CONFIG_FILE'] = ORIGINAL_ENV
    else delete process.env['ELASTIC_CLI_CONFIG_FILE']
  })

  it('writes top-level candidates and a :N directive line', async () => {
    const buf = bufferedWriter()
    await handleComplete([''], buf.write)
    const out = parseOutput(buf.chunks.join(''))
    assert.ok(out.candidates.includes('stack'))
    assert.ok(out.candidates.includes('cloud'))
    assert.equal(out.directive & 2, 2, 'directive should include NO_FILE_COMP')
  })

  it('rewrites the "es" alias to walk into stack/es', async () => {
    const buf = bufferedWriter()
    await handleComplete(['es', ''], buf.write)
    const out = parseOutput(buf.chunks.join(''))
    assert.ok(out.candidates.length > 5, `expected >5 es children, got ${out.candidates.length}`)
  })

  it('produces the same candidate set for "es" and "elasticsearch"', async () => {
    const a = bufferedWriter()
    await handleComplete(['es', ''], a.write)
    const b = bufferedWriter()
    await handleComplete(['elasticsearch', ''], b.write)
    assert.deepEqual(
      parseOutput(a.chunks.join('')).candidates.sort(),
      parseOutput(b.chunks.join('')).candidates.sort(),
    )
  })

  it('never throws on malformed input and emits :2', async () => {
    const buf = bufferedWriter()
    await handleComplete(['this', 'path', 'does', 'not', 'exist', ''], buf.write)
    const out = parseOutput(buf.chunks.join(''))
    assert.equal(out.directive & 2, 2)
  })
})

describe('handleComplete -- dynamic context name completion', () => {
  const ORIGINAL_ENV = process.env['ELASTIC_CLI_CONFIG_FILE']
  beforeEach(() => { delete process.env['ELASTIC_CLI_CONFIG_FILE'] })
  afterEach(() => {
    if (ORIGINAL_ENV != null) process.env['ELASTIC_CLI_CONFIG_FILE'] = ORIGINAL_ENV
    else delete process.env['ELASTIC_CLI_CONFIG_FILE']
  })

  it('emits context names from the configured file', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-cnames-'))
    const path = join(dir, 'config.yml')
    await writeFile(path, [
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '  staging:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '',
    ].join('\n'))
    process.env['ELASTIC_CLI_CONFIG_FILE'] = path

    const buf = bufferedWriter()
    await handleComplete(['--use-context', ''], buf.write)
    await rm(dir, { recursive: true })

    const out = parseOutput(buf.chunks.join(''))
    assert.deepEqual(out.candidates.sort(), ['local', 'staging'])
  })
})

describe('buildCompleteCommand', () => {
  it('returns a hidden Commander command named __complete', () => {
    const cmd = buildCompleteCommand()
    assert.equal(cmd.name(), '__complete')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal((cmd as unknown as any)._hidden, true)
  })

  it('routes parseAsync via the action handler and writes to the default sink', async () => {
    // Exercises both the action callback in buildCompleteCommand AND the
    // defaultWriter branch in handleComplete (no writer override). We
    // forward-write so the test runner's own progress lines still appear.
    const cmd = buildCompleteCommand()
    const origArgv = process.argv
    const origWrite = process.stdout.write.bind(process.stdout)
    const captured: string[] = []
    process.stdout.write = ((c: string | Uint8Array, ...rest: unknown[]) => {
      captured.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf-8'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origWrite as any)(c, ...rest)
    }) as typeof process.stdout.write
    process.argv = ['node', 'cli.js', '__complete', '--', '']
    try {
      await cmd.parseAsync([''], { from: 'user' })
    } finally {
      process.argv = origArgv
      process.stdout.write = origWrite
    }
    assert.match(captured.join(''), /:\d+/, 'expected the trailing directive line')
  })

  it('falls back to the variadic positional words when "--" is absent', async () => {
    const cmd = buildCompleteCommand()
    const origArgv = process.argv
    const origWrite = process.stdout.write.bind(process.stdout)
    const captured: string[] = []
    process.stdout.write = ((c: string | Uint8Array, ...rest: unknown[]) => {
      captured.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf-8'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origWrite as any)(c, ...rest)
    }) as typeof process.stdout.write
    process.argv = ['node', 'cli.js', '__complete']
    try {
      await cmd.parseAsync([], { from: 'user' })
    } finally {
      process.argv = origArgv
      process.stdout.write = origWrite
    }
    assert.match(captured.join(''), /:\d+/)
  })
})
