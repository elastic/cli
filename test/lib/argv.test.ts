/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { firstSubcommand } from '../../src/lib/argv.ts'

describe('firstSubcommand', () => {
  it('returns the first non-flag argument when no flags precede it', () => {
    assert.equal(firstSubcommand(['node', 'elastic', 'cloud']), 'cloud')
  })

  it('returns the first non-flag argument when a boolean flag precedes it', () => {
    assert.equal(firstSubcommand(['node', 'elastic', '--json', 'cloud']), 'cloud')
  })

  it('returns the first non-flag argument when a value flag precedes it', () => {
    assert.equal(
      firstSubcommand(['node', 'elastic', '--use-context', 'serverless', 'cloud']),
      'cloud'
    )
  })

  it('returns the first non-flag argument when multiple flags precede it', () => {
    assert.equal(
      firstSubcommand(['node', 'elastic', '--json', '--use-context', 'staging', 'es']),
      'es'
    )
  })

  it('returns undefined when no arguments are provided', () => {
    assert.equal(firstSubcommand(['node', 'elastic']), undefined)
  })

  it('returns undefined when only flags are provided', () => {
    assert.equal(firstSubcommand(['node', 'elastic', '--json']), undefined)
  })

  it('skips values of flag options (e.g. --use-context <name>)', () => {
    // "staging" is the value of --use-context, not a subcommand
    assert.equal(
      firstSubcommand(['node', 'elastic', '--use-context', 'staging']),
      undefined
    )
  })

  it('skips values of flag options (e.g. --config-file <path>)', () => {
    assert.equal(
      firstSubcommand(['node', 'elastic', '--config-file', '/path/to/config.yml']),
      undefined
    )
  })

  it('handles subcommand followed by sub-subcommand correctly', () => {
    assert.equal(
      firstSubcommand(['node', 'elastic', '--json', 'cloud', 'elasticsearch-projects', 'list']),
      'cloud'
    )
  })
})
