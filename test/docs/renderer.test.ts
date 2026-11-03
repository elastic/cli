/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../../src/docs/renderer.ts'

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

  describe('plain text', () => {
    it('renders headings with their level marker', () => {
      assert.equal(renderMarkdown('# Title\n\n### Sub', false), '# Title\n\n### Sub')
    })

    it('renders emphasis, strikethrough and inline code without markers', () => {
      assert.equal(renderMarkdown('**b** *i* ~~d~~ `c`', false), 'b i d c')
    })

    it('does not HTML-escape text or code', () => {
      const md = 'a < b && "c" \'d\' `<e>`\n\n```\nif (a < b && c) {}\n```'
      assert.equal(renderMarkdown(md, false), 'a < b && "c" \'d\' <e>\n\n    if (a < b && c) {}')
    })

    it('indents code blocks and leaves blank lines empty', () => {
      assert.equal(renderMarkdown('```js\nconst x = 1\n\nx++\n```', false), '    const x = 1\n\n    x++')
    })

    it('renders unordered, ordered and task lists', () => {
      assert.equal(renderMarkdown('- a\n- [x] done\n- [ ] todo', false), '* a\n* [x] done\n* [ ] todo')
      assert.equal(renderMarkdown('3. c\n4. d', false), '3. c\n4. d')
    })

    it('indents nested lists under their parent bullet', () => {
      assert.equal(
        renderMarkdown('- a\n  1. one\n  2. two\n     - deep\n- b', false),
        '* a\n  1. one\n  2. two\n     * deep\n* b',
      )
    })

    it('keeps blank lines between items of a loose list', () => {
      assert.equal(renderMarkdown('- a\n\n- b', false), '* a\n\n* b')
    })

    it('renders links as text followed by the URL', () => {
      assert.equal(
        renderMarkdown('see [the *docs*](https://e.co/x), <https://e.co> and ![logo](https://e.co/l.png)', false),
        'see the docs (https://e.co/x), https://e.co and logo (https://e.co/l.png)',
      )
    })

    it('prefixes blockquote lines with a bar', () => {
      assert.equal(renderMarkdown('> quoted\n> text\n>\n> more', false), '│ quoted\n│ text\n\n│ more')
    })

    it('renders tables as aligned columns', () => {
      const md = '| Name | Type |\n| --- | ---: |\n| `index` | string |\n| timeout | time value |'
      assert.equal(
        renderMarkdown(md, false),
        'Name     Type\n-------  ----------\nindex    string\ntimeout  time value',
      )
    })

    it('renders horizontal rules and hard line breaks', () => {
      assert.equal(renderMarkdown('a  \nb\n\n---\n\nc', false), `a\nb\n\n${'─'.repeat(40)}\n\nc`)
    })
  })

  describe('color', () => {
    it('styles headings, emphasis and inline code', () => {
      assert.equal(renderMarkdown('# T', true), '\x1b[1m# T\x1b[22m')
      assert.equal(
        renderMarkdown('**b** *i* ~~d~~ `c`', true),
        '\x1b[1mb\x1b[22m \x1b[3mi\x1b[23m \x1b[9md\x1b[29m \x1b[33mc\x1b[39m',
      )
    })

    it('styles code blocks, link URLs and blockquote bars', () => {
      assert.equal(renderMarkdown('```\nx\n```', true), '\x1b[33m    x\x1b[39m')
      assert.equal(renderMarkdown('[a](https://e.co)', true), 'a (\x1b[36mhttps://e.co\x1b[39m)')
      assert.equal(renderMarkdown('> q', true), '\x1b[90m│ \x1b[39mq')
    })

    it('pads table columns by visible width, not ANSI length', () => {
      const md = '| A | B |\n| - | - |\n| `long` | x |'
      assert.equal(stripAnsi(renderMarkdown(md, true)), renderMarkdown(md, false))
    })

    describe('default', () => {
      const { isTTY, hasColors } = process.stdout
      afterEach(() => { Object.assign(process.stdout, { isTTY, hasColors }) })

      it('styles output when stdout is a color-capable TTY', () => {
        Object.assign(process.stdout, { isTTY: true, hasColors: () => true })
        assert.equal(renderMarkdown('**b**'), '\x1b[1mb\x1b[22m')
      })

      it('renders plain text when the TTY has no color support (e.g. NO_COLOR)', () => {
        Object.assign(process.stdout, { isTTY: true, hasColors: () => false })
        assert.equal(renderMarkdown('**b**'), 'b')
      })

      it('renders plain text when stdout is not a TTY', () => {
        Object.assign(process.stdout, { isTTY: false, hasColors: () => true })
        assert.equal(renderMarkdown('**b**'), 'b')
      })
    })
  })
})
