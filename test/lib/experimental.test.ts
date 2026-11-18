/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ACCEPT_EXPERIMENTAL_OPTION, warnIfExperimental } from '../../src/lib/experimental.ts'
import type { ParsedResult } from '../../src/factory.ts'

function capture (): { write: (s: string) => boolean, text: () => string } {
  const chunks: string[] = []
  return { write: (s) => { chunks.push(s); return true }, text: () => chunks.join('') }
}

function withStderrTTY (value: boolean, fn: () => void): void {
  const orig = process.stderr.isTTY
  Object.defineProperty(process.stderr, 'isTTY', { value, configurable: true, writable: true })
  try { fn() } finally {
    Object.defineProperty(process.stderr, 'isTTY', { value: orig, configurable: true, writable: true })
  }
}

const parsed = (options: ParsedResult['options'] = {}): ParsedResult => ({ options })

describe('ACCEPT_EXPERIMENTAL_OPTION', () => {
  it('is a boolean --accept-experimental flag', () => {
    assert.equal(ACCEPT_EXPERIMENTAL_OPTION.long, 'accept-experimental')
    assert.equal(ACCEPT_EXPERIMENTAL_OPTION.type, 'boolean')
    assert.match(ACCEPT_EXPERIMENTAL_OPTION.description, /experimental/)
  })
})

describe('warnIfExperimental', () => {
  const docs = { label: 'docs search', status: 'in active development', advice: 'Not yet suited for scripts or automation.' }
  const nightshift = { label: 'nightshift ask', status: 'subject to significant changes before it reaches a stable state' }

  it('writes the banner with an advice line', () => {
    const err = capture()
    withStderrTTY(false, () => { warnIfExperimental(parsed(), docs, err) })
    assert.equal(err.text(),
      'Warning: "docs search" is experimental and in active development.\n' +
      '         Not yet suited for scripts or automation. Pass --accept-experimental to suppress this warning.\n\n')
  })

  it('writes the banner without an advice line', () => {
    const err = capture()
    withStderrTTY(false, () => { warnIfExperimental(parsed(), nightshift, err) })
    assert.equal(err.text(),
      'Warning: "nightshift ask" is experimental and subject to significant changes before it reaches a stable state.\n' +
      '         Pass --accept-experimental to suppress this warning.\n\n')
  })

  it('colors the banner yellow only when stderr is a TTY', () => {
    const tty = capture()
    withStderrTTY(true, () => { warnIfExperimental(parsed(), nightshift, tty) })
    assert.ok(tty.text().startsWith('\x1b[33mWarning: "nightshift ask"'))
    assert.ok(tty.text().endsWith('\x1b[0m'))
  })

  it('is suppressed by --accept-experimental', () => {
    const err = capture()
    warnIfExperimental(parsed({ 'accept-experimental': true }), nightshift, err)
    assert.equal(err.text(), '')
  })

  it('is suppressed by --json', () => {
    const err = capture()
    warnIfExperimental(parsed({ json: true }), nightshift, err)
    assert.equal(err.text(), '')
  })
})
