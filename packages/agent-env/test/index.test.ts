/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectAgent, AGENT_SHORT_CODES, normalizeModelId, resolveLlm } from '../src/index.ts'

describe('detectAgent', () => {
  it('reports confidence 1 when every var agrees', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', CLAUDE_CODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'claude-code')
    assert.equal(d.confidence, 1)
  })

  it('computes fractional confidence from vote share', () => {
    const d = detectAgent(0.5, { CLAUDECODE: '1', CLAUDE_CODE: '1', CODEX_CI: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'claude-code')
    assert.ok(Math.abs(d.confidence - 2 / 3) < 1e-9)
  })

  it('returns null when below minConfidence', () => {
    assert.equal(detectAgent(0.95, { CLAUDECODE: '1', CODEX_CI: '1' }), null)
  })

  it('returns null when no agent vars are present', () => {
    assert.equal(detectAgent(0.95, { PATH: '/usr/bin' }), null)
  })

  it('defaults minConfidence to 0.95', () => {
    // Single var => confidence 1, passes the default bar.
    const d = detectAgent(undefined, { GEMINI_CLI: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'gemini-cli')
    // A 0.5 split fails the default bar.
    assert.equal(detectAgent(undefined, { GEMINI_CLI: '1', CRUSH: '1' }), null)
  })

  it('honors exact-value markers', () => {
    assert.equal(detectAgent(0.95, { VTCODE: '1' })?.agent, 'vtcode')
    assert.equal(detectAgent(0.95, { VTCODE: '0' }), null)
    assert.equal(detectAgent(0.95, { TERM_PROGRAM: 'WarpTerminal' })?.agent, 'warp')
    assert.equal(detectAgent(0.95, { TERM_PROGRAM: 'iTerm.app' }), null)
  })

  it('supports the universal AI_AGENT opt-in for any agent id', () => {
    assert.equal(detectAgent(0.95, { AI_AGENT: 'devin' })?.agent, 'devin')
  })

  it('supports the universal AGENT opt-in for KnownAgent values', () => {
    assert.equal(detectAgent(0.95, { AGENT: 'pi' })?.agent, 'pi')
  })

  it('ignores AGENT when the value is not a KnownAgent', () => {
    assert.equal(detectAgent(0.95, { AGENT: 'sandbase' }), null)
  })

  it('ignores AGENT when value is a prototype property (prototype-safety)', () => {
    assert.equal(detectAgent(0.95, { AGENT: 'constructor' }), null)
    assert.equal(detectAgent(0.95, { AGENT: 'toString' }), null)
  })

  it('AI_AGENT overrides concurrent harness markers (opt-in semantics)', () => {
    const d = detectAgent(0.95, { AI_AGENT: 'devin', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'devin')
    assert.equal(d.confidence, 1)
  })

  it('AGENT overrides concurrent harness markers (opt-in semantics)', () => {
    const d = detectAgent(0.95, { AGENT: 'pi', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'pi')
    assert.equal(d.confidence, 1)
  })

  it('accepts AI_AGENT values that are Object prototype property names (detection)', () => {
    // AI_AGENT accepts any non-empty string verbatim; prototype-name values like
    // 'constructor' are valid agent ids from detectAgent's perspective.
    // The ag= segment guard (Object.hasOwn) lives in meta.ts agentMetaOf.
    const d = detectAgent(0.95, { AI_AGENT: 'constructor' })
    assert.ok(d != null)
    assert.equal(d.agent, 'constructor')
  })

  it('ignores AGENT values that shadow Object prototype property names', () => {
    assert.equal(detectAgent(0.95, { AGENT: 'constructor' }), null)
  })

  it('AI_AGENT overrides conflicting harness markers', () => {
    // Without the fix: votes=[devin, claude-code], confidence=0.5, low-confidence error.
    // With the fix: AI_AGENT exits early, returns devin at confidence 1.
    const d = detectAgent(0.95, { AI_AGENT: 'devin', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'devin')
    assert.equal(d.confidence, 1)
  })

  it('AGENT overrides conflicting harness markers', () => {
    const d = detectAgent(0.95, { AGENT: 'pi', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'pi')
    assert.equal(d.confidence, 1)
  })

  it('breaks ties by marker priority (cowork before claude-code)', () => {
    const d = detectAgent(0.5, { CLAUDE_CODE_IS_COWORK: '1', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'cowork')
  })

  it('folds cowork parent markers into cowork at default confidence', () => {
    // CLAUDE_CODE_IS_COWORK + CLAUDECODE describe one session; the parent
    // claude-code vote must collapse into cowork rather than splitting to 0.5.
    const d = detectAgent(undefined, { CLAUDE_CODE_IS_COWORK: '1', CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'cowork')
    assert.equal(d.confidence, 1)
  })

  it('folds inherited CURSOR_TRACE_ID into cursor-cli at default confidence', () => {
    const d = detectAgent(undefined, { CURSOR_AGENT: '1', CURSOR_TRACE_ID: 'x' })
    assert.ok(d != null)
    assert.equal(d.agent, 'cursor-cli')
    assert.equal(d.confidence, 1)
  })

  it('does not fold when the child marker is absent', () => {
    // Bare CURSOR_TRACE_ID stays cursor; no cursor-cli marker to fold into.
    assert.equal(detectAgent(undefined, { CURSOR_TRACE_ID: 'x' })?.agent, 'cursor')
  })

  it('discards cursor votes when any non-cursor marker is present', () => {
    // CURSOR_TRACE_ID is commonly inherited; must not suppress the real harness.
    const d = detectAgent(undefined, { CLAUDECODE: '1', CURSOR_TRACE_ID: 'x' })
    assert.ok(d != null)
    assert.equal(d.agent, 'claude-code')
    assert.equal(d.confidence, 1)
  })

  it('discards cursor-cli votes too when any non-cursor marker is present', () => {
    const d = detectAgent(undefined, { PI_CODING_AGENT: '1', CURSOR_AGENT: '1', CURSOR_TRACE_ID: 'x' })
    assert.ok(d != null)
    assert.equal(d.agent, 'pi')
    assert.equal(d.confidence, 1)
  })

  it('keeps cursor-cli when no non-cursor marker is present', () => {
    // Ensure ambient filtering is only applied when another harness fired.
    const d = detectAgent(undefined, { CURSOR_AGENT: '1', CURSOR_TRACE_ID: 'x' })
    assert.ok(d != null)
    assert.equal(d.agent, 'cursor-cli')
  })

  it('ignores empty-string vars', () => {
    assert.equal(detectAgent(0.95, { CLAUDECODE: '' }), null)
  })

  it('includes llm from PI_MODEL when pi is detected', () => {
    const d = detectAgent(0.95, { PI_CODING_AGENT: '1', PI_MODEL: 'claude-sonnet-4-5' })
    assert.ok(d != null)
    assert.equal(d.agent, 'pi')
    assert.deepEqual(d.llm, { model: 'claude-sonnet-4-5', vendor: 'anthropic' })
  })

  it('includes llm from ANTHROPIC_MODEL when claude-code is detected', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', ANTHROPIC_MODEL: 'claude-opus-4-5' })
    assert.ok(d != null)
    assert.equal(d.agent, 'claude-code')
    assert.deepEqual(d.llm, { model: 'claude-opus-4-5', vendor: 'anthropic' })
  })

  it('includes llm from COPILOT_MODEL when github-copilot is detected', () => {
    const d = detectAgent(0.95, { COPILOT_MODEL: 'gpt-5.4' })
    assert.ok(d != null)
    assert.equal(d.agent, 'github-copilot')
    assert.deepEqual(d.llm, { model: 'gpt-5.4', vendor: 'openai' })
  })

  it('normalizes llm: lowercases', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', ANTHROPIC_MODEL: 'Claude-Opus-4' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'claude-opus-4', vendor: 'anthropic' })
  })

  it('normalizes llm: replaces whitespace with hyphens', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', ANTHROPIC_MODEL: 'claude sonnet 4' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'claude-sonnet-4', vendor: 'anthropic' })
  })

  it('normalizes llm: does not convert digit-hyphen-digit separators', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', ANTHROPIC_MODEL: 'claude-opus-4-6' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'claude-opus-4-6', vendor: 'anthropic' })
  })

  it('normalizes llm: combines all three rules', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1', ANTHROPIC_MODEL: 'Claude Opus 4-6' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'claude-opus-4-6', vendor: 'anthropic' })
  })

  it('normalizes llm: leaves already-normalized values unchanged', () => {
    const d = detectAgent(0.95, { COPILOT_MODEL: 'gpt-5.4' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'gpt-5.4', vendor: 'openai' })
  })

  it('omits llm when no model var is set for detected agent', () => {
    const d = detectAgent(0.95, { CLAUDECODE: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'claude-code')
    assert.equal(d.llm, undefined)
  })

  it('omits llm for agents with no known model var', () => {
    const d = detectAgent(0.95, { GEMINI_CLI: '1' })
    assert.ok(d != null)
    assert.equal(d.agent, 'gemini-cli')
    assert.equal(d.llm, undefined)
  })

  it('splits vendor from a `vendor/model` value', () => {
    const d = detectAgent(0.95, { PI_CODING_AGENT: '1', PI_MODEL: 'Anthropic/Claude-Sonnet-4-5' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'claude-sonnet-4-5', vendor: 'anthropic' })
  })

  it('omits vendor when it cannot be established', () => {
    const d = detectAgent(0.95, { PI_CODING_AGENT: '1', PI_MODEL: 'some-unknown-model' })
    assert.ok(d != null)
    assert.deepEqual(d.llm, { model: 'some-unknown-model' })
  })
})

describe('AGENT_SHORT_CODES', () => {
  const codes = Object.values(AGENT_SHORT_CODES)

  it('are all 1-3 chars', () => {
    for (const c of codes) assert.ok(c.length >= 1 && c.length <= 3, `bad code: ${c}`)
  })

  it('are unique', () => {
    assert.equal(new Set(codes).size, codes.length)
  })
})

describe('resolveLlm', () => {
  it('splits on the first slash', () => assert.deepEqual(resolveLlm('openai/gpt-4o'), { model: 'gpt-4o', vendor: 'openai' }))
  it('infers vendor from prefix when no slash', () => assert.deepEqual(resolveLlm('gpt-4o'), { model: 'gpt-4o', vendor: 'openai' }))
  it('prefers agent vendor over inference when no slash', () => assert.deepEqual(resolveLlm('mystery-1', 'acme'), { model: 'mystery-1', vendor: 'acme' }))
  it('normalizes the agent vendor fallback', () => assert.deepEqual(resolveLlm('mystery-1', ' Acme '), { model: 'mystery-1', vendor: 'acme' }))
  it('ignores an agent vendor that normalizes to empty', () => assert.deepEqual(resolveLlm('mystery-1', '   '), { model: 'mystery-1' }))
  it('omits vendor when unresolved', () => assert.deepEqual(resolveLlm('mystery-1'), { model: 'mystery-1' }))
})

describe('normalizeModelId', () => {
  it('lowercases', () => assert.equal(normalizeModelId('Claude-Opus-4'), 'claude-opus-4'))
  it('replaces whitespace with hyphens', () => assert.equal(normalizeModelId('claude sonnet 4'), 'claude-sonnet-4'))
  it('does not convert digit-hyphen-digit separators', () => assert.equal(normalizeModelId('claude-opus-4-5'), 'claude-opus-4-5'))
  it('leaves already-normalized values unchanged', () => assert.equal(normalizeModelId('gpt-4o'), 'gpt-4o'))
  it('only lowercases and collapses whitespace when combined', () => assert.equal(normalizeModelId('Claude Opus 4-5'), 'claude-opus-4-5'))
  it('trims surrounding whitespace', () => assert.equal(normalizeModelId('  claude-opus-4  '), 'claude-opus-4'))
})
