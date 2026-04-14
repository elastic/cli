/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AskStreamEvent } from './client.ts'

/**
 * Split the first complete paragraph from `text`, where a paragraph boundary
 * is a `\n\n` that is not inside a fenced code block (``` ... ```).
 * Returns [paragraph, rest] if found, or null if no complete paragraph yet.
 */
export function splitCompleteParagraph (text: string): [string, string] | null {
  let inFence = false
  let i = 0
  while (i < text.length) {
    if (i + 2 < text.length && text[i] === '`' && text[i + 1] === '`' && text[i + 2] === '`') {
      inFence = !inFence
      i += 3
      continue
    }
    if (!inFence && i + 1 < text.length && text[i] === '\n' && text[i + 1] === '\n') {
      return [text.slice(0, i), text.slice(i + 2)]
    }
    i++
  }
  return null
}

export interface SpinnerHandle {
  setPhase: (phase: string) => void
  stop: () => void
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const REFERENCES_MARKER = '<!--REFERENCES'

/** Start a spinner that writes to `err`. Returns a handle to change its phase and stop it. */
export function startSpinner (err: { write: (s: string) => boolean }, initialPhase = 'Thinking…'): SpinnerHandle {
  let phase = initialPhase
  let frame = 0
  const interval = setInterval(() => {
    err.write(`\r\x1b[K${SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length]} ${phase}`)
  }, 80)

  return {
    setPhase: (p: string) => { phase = p },
    stop: () => {
      clearInterval(interval)
      err.write('\r\x1b[K')
    },
  }
}

/**
 * Strip any partial prefix of `<!--REFERENCES` from the end of `text`.
 * Handles the case where the marker is split across SSE chunk boundaries.
 */
function stripPartialMarker (text: string): string {
  for (let len = REFERENCES_MARKER.length - 1; len >= 1; len--) {
    if (text.endsWith(REFERENCES_MARKER.slice(0, len))) {
      return text.slice(0, text.length - len)
    }
  }
  return text
}

/**
 * Stream an AI answer to stdout, flushing complete paragraphs incrementally.
 * The `<!--REFERENCES-->` block appended by the API is silently stripped —
 * the AI's own inline references section already covers this content.
 *
 * @param gen      - async generator yielding {@link AskStreamEvent} values
 * @param renderMd - markdown renderer applied to each flushed paragraph
 * @param stdout   - writable for answer output
 * @param spinner  - optional spinner; `status` events update its phase label
 */
export async function streamAnswer (
  gen: AsyncGenerator<AskStreamEvent>,
  renderMd: (md: string) => string,
  stdout: { write: (s: string) => boolean },
  spinner?: SpinnerHandle,
): Promise<void> {
  let buffer = ''
  let spinnerStopped = false
  let referencesStarted = false

  function flushOutput (text: string): void {
    if (!spinnerStopped) {
      spinner?.stop()
      spinnerStopped = true
    }
    stdout.write(text)
  }

  function tryFlushParagraphs (): void {
    let remaining = buffer
    let flushed = false
    while (true) {
      const split = splitCompleteParagraph(remaining)
      if (split == null) break
      const [para, rest] = split
      const trimmed = para.trim()
      if (trimmed !== '') flushOutput(renderMd(trimmed) + '\n\n')
      remaining = rest
      flushed = true
    }
    if (flushed) buffer = remaining
  }

  for await (const event of gen) {
    if (event.kind === 'status') {
      spinner?.setPhase(event.message)
      continue
    }
    if (referencesStarted) continue

    const combined = buffer + event.text
    const markerIdx = combined.indexOf(REFERENCES_MARKER)
    if (markerIdx >= 0) {
      buffer = combined.slice(0, markerIdx).trimEnd()
      referencesStarted = true
    } else {
      buffer = combined
    }
    tryFlushParagraphs()
  }

  const remaining = stripPartialMarker(buffer).trim()
  if (remaining !== '') {
    flushOutput(renderMd(remaining) + '\n')
  } else if (!spinnerStopped) {
    spinner?.stop()
  }
}
