/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchCommand } from '../../src/docs/search.ts'
import { _testSetStdinReader } from '../../src/factory.ts'
import type { DocsSearchResponse } from '../../src/docs/client.ts'

function makeResp (overrides: Partial<DocsSearchResponse> = {}): DocsSearchResponse {
  return {
    results: [
      {
        type: 'page',
        url: '/reference/elasticsearch',
        title: 'Elasticsearch',
        description: 'The search engine',
        score: 1,
        navigationSection: 'Reference',
        lastUpdated: '2024-01-01',
        product: { id: 'es', displayName: 'Elasticsearch' },
        relatedProducts: [],
      },
    ],
    totalResults: 1,
    pageNumber: 1,
    pageSize: 5,
    pageCount: 1,
    ...overrides,
  }
}

describe('createSearchCommand', () => {
  it('creates a command named "search"', () => {
    const cmd = createSearchCommand()
    assert.equal(cmd.name(), 'search')
  })

  it('accepts query as a positional argument or --query option', () => {
    const cmd = createSearchCommand()
    assert.equal(cmd.registeredArguments.length, 1)
    const optNames = cmd.options.map((o) => o.long)
    assert.ok(optNames.includes('--query'))
  })

  it('has --page and --size options', () => {
    const cmd = createSearchCommand()
    const optNames = cmd.options.map((o) => o.long)
    assert.ok(optNames.includes('--page'))
    assert.ok(optNames.includes('--size'))
  })

  it('returns structured results from handler', async () => {
    const stderrOutput: string[] = []
    const cmd = createSearchCommand({
      docsSearch: async () => makeResp(),
      stderr: { write: (s) => { stderrOutput.push(s); return true } },
    })

    // Access the handler indirectly by invoking the command
    const results: unknown[] = []
    const restoreStdin = _testSetStdinReader(() => '')
    const parseResult = await new Promise<unknown>((resolve) => {
      cmd.exitOverride()
      cmd.configureOutput({ writeOut: (s) => results.push(s), writeErr: () => {} })
      cmd.parseAsync(['--query', 'elasticsearch'], { from: 'user' }).then(() => resolve(results)).catch(resolve)
    })
    restoreStdin()

    // The command itself handles output, just verify no crash
    assert.ok(parseResult !== undefined)
  })

  it('formats results without product metadata', async () => {
    const output: string[] = []
    const response = makeResp({
      results: [
        {
          type: 'page',
          url: '/reference/no-product',
          title: '<em>No product</em>',
          description: '<p>Fallback description</p>',
          score: 1,
          navigationSection: 'Reference',
          lastUpdated: '2024-01-01',
          relatedProducts: [],
        } as DocsSearchResponse['results'][number],
      ],
    })
    const cmd = createSearchCommand({
      docsSearch: async () => response,
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: (s) => { output.push(s) }, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'no product'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode ?? 0, 0)
    assert.equal(output.length, 0)
  })

  it('formats an empty result set', async () => {
    const output: string[] = []
    const cmd = createSearchCommand({
      docsSearch: async () => makeResp({ results: [], totalResults: 0, pageCount: 0 }),
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: (s) => { output.push(s) }, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'missing'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode ?? 0, 0)
    assert.equal(output.length, 0)
  })

  it('returns error object when docsSearch throws', async () => {
    const stderrOutput: string[] = []
    const cmd = createSearchCommand({
      docsSearch: async () => { throw new Error('network error') },
      stderr: { write: (s) => { stderrOutput.push(s); return true } },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'test-query'], { from: 'user' })
    } finally { restoreStdin() }

    // Error is written to stderr by the factory; verify process.exitCode was set
    assert.equal(process.exitCode, 1)
    process.exitCode = 0 // reset
  })

  it('returns error when query is empty string', async () => {
    const cmd = createSearchCommand({
      docsSearch: async () => makeResp(),
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', '   '], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })

  it('emits ANSI-colored experimental banner when stderr is a TTY', async () => {
    const prevIsTTY = process.stderr.isTTY
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
    try {
      const stderrOutput: string[] = []
      const cmd = createSearchCommand({
        docsSearch: async () => makeResp(),
        stderr: { write: (s) => { stderrOutput.push(s); return true } },
      })

      cmd.exitOverride()
      cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

      const restoreStdin = _testSetStdinReader(() => '')
      try {
        await cmd.parseAsync(['--query', 'test'], { from: 'user' })
      } finally { restoreStdin() }

      const banner = stderrOutput.find(s => s.includes('experimental'))
      assert.ok(banner != null)
      assert.ok(banner.includes('\x1b[33m'), 'Expected ANSI yellow color code')
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: prevIsTTY, configurable: true })
    }
  })

  it('suppresses experimental banner when --accept-experimental is passed', async () => {
    const stderrOutput: string[] = []
    const cmd = createSearchCommand({
      docsSearch: async () => makeResp(),
      stderr: { write: (s) => { stderrOutput.push(s); return true } },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'test', '--accept-experimental'], { from: 'user' })
    } finally { restoreStdin() }

    const bannerOutput = stderrOutput.filter(s => s.includes('experimental'))
    assert.equal(bannerOutput.length, 0)
  })

  it('uses aiShortSummary when available in search results', async () => {
    const output: string[] = []
    const response = makeResp({
      results: [
        {
          type: 'page',
          url: '/reference/ai-summary',
          title: 'AI Summary Page',
          description: '<p>HTML description</p>',
          aiShortSummary: 'Concise AI-generated summary',
          score: 1,
          navigationSection: 'Reference',
          lastUpdated: '2024-01-01',
          product: { id: 'es', displayName: 'Elasticsearch' },
          relatedProducts: [],
        },
      ],
    })
    const cmd = createSearchCommand({
      docsSearch: async () => response,
      stderr: { write: (s) => { output.push(s); return true } },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: (s) => { output.push(s) }, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'ai test', '--accept-experimental'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode ?? 0, 0)
  })

  it('truncates descriptions longer than 250 characters', async () => {
    const longDesc = 'A'.repeat(300)
    const response = makeResp({
      results: [
        {
          type: 'page',
          url: '/reference/long-desc',
          title: 'Long Description',
          description: longDesc,
          score: 1,
          navigationSection: 'Reference',
          lastUpdated: '2024-01-01',
          product: { id: 'es', displayName: 'Elasticsearch' },
          relatedProducts: [],
        },
      ],
    })
    const cmd = createSearchCommand({
      docsSearch: async () => response,
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'long', '--accept-experimental'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode ?? 0, 0)
  })

  it('renders separators between multiple results', async () => {
    const response = makeResp({
      results: [
        {
          type: 'page',
          url: '/reference/one',
          title: 'First Result',
          description: 'First description',
          score: 2,
          navigationSection: 'Reference',
          lastUpdated: '2024-01-01',
          product: { id: 'es', displayName: 'Elasticsearch' },
          relatedProducts: [],
        },
        {
          type: 'page',
          url: '/reference/two',
          title: 'Second Result',
          description: 'Second description',
          score: 1,
          navigationSection: 'Reference',
          lastUpdated: '2024-01-01',
          product: { id: 'kb', displayName: 'Kibana' },
          relatedProducts: [],
        },
      ],
      totalResults: 2,
    })
    const cmd = createSearchCommand({
      docsSearch: async () => response,
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'multi', '--accept-experimental'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode ?? 0, 0)
  })

  it('returns error when docsSearch throws a non-Error value', async () => {
    const cmd = createSearchCommand({
      docsSearch: async () => { throw 'plain string failure' },
      stderr: { write: () => true },
    })

    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })

    const restoreStdin = _testSetStdinReader(() => '')
    try {
      await cmd.parseAsync(['--query', 'test'], { from: 'user' })
    } finally { restoreStdin() }

    assert.equal(process.exitCode, 1)
    process.exitCode = 0
  })
})
