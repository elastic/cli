/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSseText } from '../../src/lib/sse.ts'

describe('parseSseText', () => {
  it('parses a single frame with event and data', () => {
    assert.deepEqual(
      parseSseText('event: message_chunk\ndata: {"text":"hi"}\n\n'),
      [{ event: 'message_chunk', data: '{"text":"hi"}' }]
    )
  })

  it('preserves multiple frames in order', () => {
    assert.deepEqual(
      parseSseText('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n'),
      [{ event: 'a', data: '1' }, { event: 'b', data: '2' }]
    )
  })

  it('defaults the event type to "message" when no event: field is present', () => {
    assert.deepEqual(parseSseText('data: x\n\n'), [{ event: 'message', data: 'x' }])
  })

  it('joins multiple data: lines with a newline (raw, not JSON-parsed)', () => {
    assert.deepEqual(parseSseText('data: a\ndata: b\n\n'), [{ event: 'message', data: 'a\nb' }])
  })

  it('ignores comment/keep-alive lines and unknown fields', () => {
    const body = ': keep-alive\n\nid: 42\nretry: 3000\nfoo: bar\nevent: e\ndata: v\n\n'
    assert.deepEqual(parseSseText(body), [{ event: 'e', data: 'v' }])
  })

  it('strips only one leading space after the field colon and tolerates none', () => {
    assert.deepEqual(parseSseText('event:e\ndata:  v\n\n'), [{ event: 'e', data: ' v' }])
  })

  it('normalises CRLF line endings', () => {
    assert.deepEqual(parseSseText('event: e\r\ndata: v\r\n\r\n'), [{ event: 'e', data: 'v' }])
  })

  it('parses a final frame with no trailing blank line', () => {
    assert.deepEqual(parseSseText('event: e\ndata: v'), [{ event: 'e', data: 'v' }])
  })

  it('drops blocks with no data: field and returns [] for comment-only input', () => {
    assert.deepEqual(parseSseText(': keep-alive\n\n: 0000\n\n'), [])
  })
})
