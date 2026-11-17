/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CLAUDE_PLUGIN_HINT, emitClaudePluginHint } from '../../src/lib/claude-plugin-hint.ts'

describe('emitClaudePluginHint', () => {
  it('writes the plugin hint when CLAUDECODE is set', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDECODE: '1' }, (s) => { lines.push(s) })
    assert.deepEqual(lines, [CLAUDE_PLUGIN_HINT])
    assert.match(CLAUDE_PLUGIN_HINT, /^<claude-code-hint v="1" type="plugin" value="elastic@anthropic-plugin-directory" \/>\n$/)
  })

  it('writes the plugin hint when CLAUDE_CODE_CHILD_SESSION is set', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDE_CODE_CHILD_SESSION: '1' }, (s) => { lines.push(s) })
    assert.deepEqual(lines, [CLAUDE_PLUGIN_HINT])
  })

  it('writes nothing when Claude env vars are absent', () => {
    const lines: string[] = []
    emitClaudePluginHint({}, (s) => { lines.push(s) })
    assert.deepEqual(lines, [])
  })

  it('writes nothing when Claude env vars are empty', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDECODE: '', CLAUDE_CODE_CHILD_SESSION: '' }, (s) => { lines.push(s) })
    assert.deepEqual(lines, [])
  })
})
