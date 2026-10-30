/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as util from 'node:util'
import { Marked } from 'marked'

// Callers load this module with a dynamic import so `docs --help` and shell
// completion do not pay for loading marked.

/**
 * Whether stdout takes ANSI styling: a TTY whose `hasColors()` allows it
 * (honors NO_COLOR, FORCE_COLOR and TERM). Checked here instead of through
 * styleText's own `validateStream`, which Node only has from 22.13.
 */
function stdoutHasColors (): boolean {
  return typeof util.styleText === 'function' && process.stdout.isTTY === true && process.stdout.hasColors()
}

const indent = (text: string, pad: string): string => text.replace(/^(?=.)/gm, pad)

/**
 * Parse `md` as markdown and render it for terminal output.
 * Returns the rendered string with trailing whitespace trimmed.
 *
 * @param md    - markdown source
 * @param color - emit ANSI styling; defaults to whether stdout supports color
 */
export function renderMarkdown (md: string, color = stdoutHasColors()): string {
  const style = (format: Parameters<typeof util.styleText>[0], text: string): string => color ? util.styleText(format, text, { validateStream: false }) : text
  const marked = new Marked({
    renderer: {
      heading ({ tokens, depth }) { return style('bold', `${'#'.repeat(depth)} ${this.parser.parseInline(tokens)}`) + '\n\n' },
      paragraph ({ tokens }) { return this.parser.parseInline(tokens) + '\n\n' },
      strong ({ tokens }) { return style('bold', this.parser.parseInline(tokens)) },
      em ({ tokens }) { return style('italic', this.parser.parseInline(tokens)) },
      del ({ tokens }) { return style('strikethrough', this.parser.parseInline(tokens)) },
      codespan ({ text }) { return style('yellow', text) },
      code ({ text }) { return style('yellow', indent(text, '    ')) + '\n\n' },
      // block-level text (tight list items) ends its line so a nested list starts on the next one
      text (token) { return 'tokens' in token && token.tokens != null ? this.parser.parseInline(token.tokens) + '\n' : token.text },
      br () { return '\n' },
      hr () { return '─'.repeat(40) + '\n\n' },
      link ({ href, text, tokens }) { return text === href ? style('cyan', href) : `${this.parser.parseInline(tokens)} (${style('cyan', href)})` },
      image ({ href, text }) { return `${text} (${style('cyan', href)})` },
      blockquote ({ tokens }) { return indent(this.parser.parse(tokens).trim(), style('gray', '│ ')) + '\n\n' },
      checkbox ({ checked }) { return checked ? '[x] ' : '[ ] ' },
      list ({ ordered, start, loose, items }) {
        const first = start === '' ? 1 : start
        return items.map((item, i) => {
          const bullet = ordered ? `${first + i}. ` : '* '
          return bullet + indent(this.parser.parse(item.tokens).trim(), ' '.repeat(bullet.length)).slice(bullet.length)
        }).join(loose ? '\n\n' : '\n') + '\n\n'
      },
      table ({ header, rows }) {
        const cells = [header, ...rows].map((row) => row.map((cell) => this.parser.parseInline(cell.tokens)))
        const width = (s: string): number => util.stripVTControlCharacters(s).length
        const widths = header.map((_, i) => Math.max(...cells.map((row) => width(row[i] ?? ''))))
        const line = (row: string[]): string => row.map((c, i) => c + ' '.repeat((widths[i] ?? 0) - width(c))).join('  ').trimEnd()
        const [head = [], ...body] = cells
        return [line(head.map((c) => style('bold', c))), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n') + '\n\n'
      },
    },
  })
  return (marked.parse(md) as string).trimEnd()
}
