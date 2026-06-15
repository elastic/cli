/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../../src/docs/renderer.ts'

// Strip ANSI escape codes before asserting on code block content.
// In a color-capable terminal, cli-highlight wraps individual tokens in color
// sequences, so 'const x = 1' is not a contiguous substring of the output.
// CI has chalk.level 0 (no TTY), so this is a no-op there.
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\u001B\[[\d;]*m/g, '')

describe('renderMarkdown', () => {
  it('returns a non-empty string for simple markdown', () => {
    const out = renderMarkdown('# Hello\n\nWorld')
    assert.equal(typeof out, 'string')
    assert.ok(out.length > 0)
    assert.ok(out.includes('Hello'))
    assert.ok(out.includes('World'))
  })

  it('trims trailing whitespace', () => {
    const out = renderMarkdown('hello world')
    assert.equal(out, out.trimEnd())
  })

  it('handles an empty string without throwing', () => {
    assert.equal(renderMarkdown(''), '')
  })

  it('renders fenced code blocks', () => {
    const out = renderMarkdown('```\nconst x = 1\n```')
    assert.ok(stripAnsi(out).includes('const x = 1'))
  })
})
