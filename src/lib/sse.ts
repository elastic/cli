/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Server-Sent Events (SSE) parser.
 *
 * Copied and adapted from elastic/elastic-ramen (MIT-licensed):
 *   https://github.com/elastic/elastic-ramen/blob/dev/packages/opencode/src/elastic/sse.ts
 * Kept as a standalone, transport-agnostic module so it can be promoted to a shared
 * package later without touching call sites.
 *
 * Implements the WHATWG event-stream grammar subset:
 *   https://html.spec.whatwg.org/multipage/server-sent-events.html
 * Kibana emits these frames via @kbn/sse-utils-server's `observableIntoEventSourceStream`,
 * used by the agent_builder `converse/async` route:
 *   https://github.com/elastic/kibana/blob/main/x-pack/platform/plugins/shared/agent_builder/server/routes/chat.ts
 */

/**
 * A single parsed SSE frame.
 *
 * `data` is the raw joined value of one or more `data:` lines (per spec, joined with `\n`);
 * callers decide whether to JSON-parse it. `event` defaults to `"message"` when the frame
 * omits an `event:` field, matching the SSE default event type.
 */
export interface SseEvent {
  event: string
  data: string
}

/**
 * Parses a fully-buffered SSE payload into an ordered array of {@link SseEvent}.
 *
 * For callers that already hold the complete response body (e.g. a client that buffers via
 * `response.text()`).
 */
export function parseSseText (text: string): SseEvent[] {
  const events: SseEvent[] = []
  // Normalise CRLF/CR to LF, then split into blocks on blank lines.
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n\n+/)) {
    const ev = parseBlock(block)
    if (ev != null) events.push(ev)
  }
  return events
}

/**
 * Parses a single event block (the lines between blank-line separators).
 *
 * `:`-prefixed comment/keep-alive lines and unknown fields are ignored; one optional space
 * after each field colon is stripped. Returns `undefined` for blocks with no `data:` line.
 */
function parseBlock (block: string): SseEvent | undefined {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const raw = colon === -1 ? '' : line.slice(colon + 1)
    const value = raw.startsWith(' ') ? raw.slice(1) : raw
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return undefined
  return { event, data: data.join('\n') }
}
