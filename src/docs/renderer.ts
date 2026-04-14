/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

// Register the terminal renderer once at module load.
// Use markedTerminal() (the extension factory) rather than new TerminalRenderer(),
// so that each renderer method has access to the parser instance (r.parser = this.parser).
//
// Pass an empty cli-highlight theme as the second argument so that individual
// syntax tokens (keywords, strings, identifiers) are not colored by cli-highlight.
// Per-token ANSI coloring conflicts with many terminal themes, making keywords like
// `using` or string delimiters invisible. Code blocks still render with 4-space
// indentation via marked-terminal; they just won't have language-specific colors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
marked.use(markedTerminal({}, { theme: {} }) as any)

/**
 * Parse `md` as markdown and render it for terminal output.
 * Returns the rendered string with trailing whitespace trimmed.
 */
export function renderMarkdown (md: string): string {
  return (marked.parse(md) as string).trimEnd()
}
