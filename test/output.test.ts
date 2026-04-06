/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderText, renderTable } from '../src/output.ts'

describe('renderTable', () => {
  it('returns empty string for an empty array', () => {
    assert.equal(renderTable([]), '')
  })

  it('renders a single row with a header and separator', () => {
    const out = renderTable([{ name: 'foo', count: 3 }])
    const lines = out.trimEnd().split('\n')
    assert.equal(lines.length, 3)
    assert.match(lines[0]!, /name/)
    assert.match(lines[0]!, /count/)
    assert.match(lines[1]!, /^-/)
    assert.match(lines[2]!, /foo/)
    assert.match(lines[2]!, /3/)
  })

  it('renders multiple rows', () => {
    const out = renderTable([
      { name: 'foo', count: 3 },
      { name: 'bar', count: 12 },
    ])
    const lines = out.trimEnd().split('\n')
    assert.equal(lines.length, 4)
    assert.match(lines[2]!, /foo/)
    assert.match(lines[3]!, /bar/)
  })

  it('aligns columns to the widest value', () => {
    const out = renderTable([
      { name: 'short', count: 1 },
      { name: 'a-much-longer-name', count: 999 },
    ])
    const lines = out.trimEnd().split('\n')
    const headerWidth = lines[0]!.indexOf('count')
    const dataRow1Width = lines[2]!.indexOf('1')
    const dataRow2Width = lines[3]!.indexOf('999')
    assert.equal(headerWidth, dataRow1Width, 'count column starts at same position in both data rows')
    assert.equal(dataRow1Width, dataRow2Width)
  })

  it('uses the first row keys as column headers', () => {
    const out = renderTable([{ alpha: 'x', beta: 'y' }])
    assert.match(out, /alpha/)
    assert.match(out, /beta/)
  })

  it('treats null values as empty strings', () => {
    const out = renderTable([{ name: 'foo', value: null }])
    const lines = out.trimEnd().split('\n')
    assert.match(lines[2]!, /foo/)
  })

  it('separator line uses dashes matching column widths', () => {
    const out = renderTable([{ id: 'abc' }])
    const lines = out.trimEnd().split('\n')
    assert.match(lines[1]!, /^---/)
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

    it('table output has a separator line', () => {
      const out = renderText([{ name: 'foo' }])
      const lines = out.trimEnd().split('\n')
      assert.match(lines[1]!, /^-+$/)
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
