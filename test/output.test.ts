/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderText, renderTable, formatHandlerError } from '../src/output.ts'

describe('renderTable', () => {
  it('returns empty string for an empty array', () => {
    assert.equal(renderTable([]), '')
  })

  it('renders a single row with a header and separator', () => {
    // cli-table3 layout: top border / header / separator / data / bottom border = 5 lines
    const out = renderTable([{ name: 'foo', count: 3 }])
    const lines = out.trimEnd().split('\n')
    assert.equal(lines.length, 5)
    assert.match(lines[1]!, /name/)
    assert.match(lines[1]!, /count/)
    assert.match(lines[3]!, /foo/)
    assert.match(lines[3]!, /3/)
  })

  it('renders multiple rows', () => {
    // cli-table3 layout: top / header / sep / row / sep / row / bottom = 7 lines
    const out = renderTable([
      { name: 'foo', count: 3 },
      { name: 'bar', count: 12 },
    ])
    const lines = out.trimEnd().split('\n')
    assert.equal(lines.length, 7)
    assert.match(lines[3]!, /foo/)
    assert.match(lines[5]!, /bar/)
  })

  it('includes all values in the output', () => {
    const out = renderTable([
      { name: 'short', count: 1 },
      { name: 'a-much-longer-name', count: 999 },
    ])
    assert.match(out, /short/)
    assert.match(out, /a-much-longer-name/)
    assert.match(out, /999/)
  })

  it('uses the first row keys as column headers', () => {
    const out = renderTable([{ alpha: 'x', beta: 'y' }])
    assert.match(out, /alpha/)
    assert.match(out, /beta/)
  })

  it('treats null values as empty strings', () => {
    const out = renderTable([{ name: 'foo', value: null }])
    const lines = out.trimEnd().split('\n')
    assert.match(lines[3]!, /foo/)
  })

  it('separator line uses box-drawing characters', () => {
    const out = renderTable([{ id: 'abc' }])
    const lines = out.trimEnd().split('\n')
    // line 2 is the separator between header and data
    assert.match(lines[2]!, /[─├┤┼]/)
  })

  it('does not have trailing spaces on each line', () => {
    const out = renderTable([{ a: 'x', bb: 'y', ccc: 'z' }])
    for (const line of out.split('\n').filter((l) => l.length > 0)) {
      assert.doesNotMatch(line, / $/, `line has trailing space: ${JSON.stringify(line)}`)
    }
  })
})

describe('renderText', () => {
  describe('primitives', () => {
    it('renders a string as itself with a newline', () => {
      assert.equal(renderText('hello'), 'hello\n')
    })

    it('renders a number as its string form with a newline', () => {
      assert.equal(renderText(42), '42\n')
    })

    it('renders a boolean as its string form with a newline', () => {
      assert.equal(renderText(true), 'true\n')
      assert.equal(renderText(false), 'false\n')
    })

    it('renders null as "null" with a newline', () => {
      assert.equal(renderText(null), 'null\n')
    })
  })

  describe('arrays of primitives', () => {
    it('renders each primitive on its own line', () => {
      assert.equal(renderText(['alpha', 'beta', 'gamma']), 'alpha\nbeta\ngamma\n')
    })

    it('renders an array of numbers one per line', () => {
      assert.equal(renderText([1, 2, 3]), '1\n2\n3\n')
    })

    it('renders an empty array as a single newline', () => {
      assert.equal(renderText([]), '\n')
    })
  })

  describe('arrays of flat objects', () => {
    it('renders an array of flat objects as a table', () => {
      const out = renderText([
        { name: 'foo', status: 'ok' },
        { name: 'bar', status: 'error' },
      ])
      assert.match(out, /name/)
      assert.match(out, /status/)
      assert.match(out, /foo/)
      assert.match(out, /bar/)
    })

    it('table output has a separator line with box-drawing characters', () => {
      const out = renderText([{ name: 'foo' }])
      const lines = out.trimEnd().split('\n')
      assert.match(lines[2]!, /[─├┤┼]/)
    })
  })

  describe('complex types — fall back to pretty JSON', () => {
    it('renders a plain object as pretty-printed JSON', () => {
      const val = { key: 'value', nested: { x: 1 } }
      assert.equal(renderText(val), JSON.stringify(val, null, 2) + '\n')
    })

    it('renders an array of nested objects as pretty-printed JSON', () => {
      const val = [{ name: 'foo', tags: ['a', 'b'] }]
      assert.equal(renderText(val), JSON.stringify(val, null, 2) + '\n')
    })

    it('renders a mixed array (primitives and objects) as pretty-printed JSON', () => {
      const val = ['hello', { key: 1 }]
      assert.equal(renderText(val as never), JSON.stringify(val, null, 2) + '\n')
    })

    it('renders a flat object (not an array) as pretty-printed JSON', () => {
      const val = { status: 'ok', count: 3 }
      assert.equal(renderText(val), JSON.stringify(val, null, 2) + '\n')
    })
  })
})

describe('formatHandlerError', () => {
  it('extracts type and reason from transport_error with ES body', () => {
    const val = {
      error: {
        code: 'transport_error',
        status_code: 404,
        body: { error: { type: 'index_not_found_exception', reason: 'no such index [foo]', root_cause: [] } }
      }
    }
    assert.equal(formatHandlerError(val), 'index_not_found_exception: no such index [foo]')
  })

  it('returns string body.error when body.error is a string', () => {
    const val = { error: { code: 'transport_error', status_code: 500, body: { error: 'internal failure' } } }
    assert.equal(formatHandlerError(val), 'internal failure')
  })

  it('falls back to status_code when body has no parseable error', () => {
    const val = { error: { code: 'transport_error', status_code: 503, body: { ok: false } } }
    assert.equal(formatHandlerError(val), 'request failed with status 503')
  })

  it('returns message for missing_config', () => {
    const val = { error: { code: 'missing_config', message: 'No Elasticsearch connection configured' } }
    assert.equal(formatHandlerError(val), 'No Elasticsearch connection configured')
  })

  it('returns message for cloud_api_error', () => {
    const val = { error: { code: 'cloud_api_error', message: 'Cloud API error 404: not found' } }
    assert.equal(formatHandlerError(val), 'Cloud API error 404: not found')
  })

  it('returns message for transport_error without body', () => {
    const val = { error: { code: 'transport_error', message: 'Connection refused' } }
    assert.equal(formatHandlerError(val), 'Connection refused')
  })

  it('returns fallback for unknown code without message', () => {
    const val = { error: { code: 'weird_error' } }
    assert.equal(formatHandlerError(val), 'unknown error (code: weird_error)')
  })
})
