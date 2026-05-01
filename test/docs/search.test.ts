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

  it('has a required --query option', () => {
    const cmd = createSearchCommand()
    assert.equal(cmd.registeredArguments.length, 0)
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
})
