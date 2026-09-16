/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { clientHeaders, toMetaVersion, agentMetaSegment, llmUserAgentSegment, _testResetDetection } from '../../src/lib/meta.ts'
import os from 'node:os'
import { createRequire } from 'node:module'
import { setResolvedConfig, _testResetConfig } from '../../src/config/store.ts'
import type { ResolvedConfig } from '../../src/config/types.ts'

const pkgVersion = (createRequire(import.meta.url)('../../package.json') as { version: string }).version

describe('toMetaVersion', () => {
  it('returns a stable version unchanged', () => {
    assert.equal(toMetaVersion('1.2.3'), '1.2.3')
  })

  it('converts -alpha.N to p suffix', () => {
    assert.equal(toMetaVersion('0.1.0-alpha.1'), '0.1.0p')
  })

  it('converts -beta.N to p suffix', () => {
    assert.equal(toMetaVersion('2.0.0-beta.3'), '2.0.0p')
  })

  it('converts -rc.N to p suffix', () => {
    assert.equal(toMetaVersion('1.0.0-rc.1'), '1.0.0p')
  })

  it('result matches the spec version regex', () => {
    const specRegex = /^[0-9]{1,2}\.[0-9]{1,2}(?:\.[0-9]{1,3})?p?$/
    assert.match(toMetaVersion('0.1.0-alpha.1'), specRegex)
    assert.match(toMetaVersion('1.2.3'), specRegex)
    assert.match(toMetaVersion('10.20.300'), specRegex)
  })
})

describe('clientHeaders', () => {
  const headers = clientHeaders()

  describe('user-agent', () => {
    // meta.ts hardcodes the version (release-please keeps it in sync) so the packaged
    // binary does not need to read package.json at runtime; guard against drift.
    it('starts with elastic-cli/ and the package.json version', () => {
      assert.equal(headers['user-agent'].split(' ')[0], `elastic-cli/${pkgVersion}`)
    })

    it('contains the OS platform and architecture', () => {
      assert.match(headers['user-agent'], new RegExp(`${os.platform()} ${os.arch()}`))
    })

    it('contains the Node.js version', () => {
      assert.match(headers['user-agent'], new RegExp(`Node\\.js ${process.version}`))
    })
  })

  describe('x-elastic-client-meta', () => {
    it('starts with et= service key per the spec', () => {
      assert.match(headers['x-elastic-client-meta'], /^et=/)
    })

    it('uses p suffix for pre-release CLI version', () => {
      assert.match(headers['x-elastic-client-meta'], /^et=[0-9]+\.[0-9]+\.[0-9]+p?/)
    })

    it('has js= as the second key (language key)', () => {
      const parts = headers['x-elastic-client-meta'].split(',')
      assert.match(parts[1]!, /^js=/)
    })

    it('has t= as the third key (transport key)', () => {
      const parts = headers['x-elastic-client-meta'].split(',')
      assert.match(parts[2]!, /^t=/)
    })

    it('t= equals the CLI version (no separate transport library)', () => {
      const parts = headers['x-elastic-client-meta'].split(',')
      const etValue = parts[0]!.split('=')[1]!
      const tValue = parts[2]!.split('=')[1]!
      assert.equal(tValue, etValue)
    })

    it('has et, js, t as the first three pairs (optional trailing ag= agent pair)', () => {
      const parts = headers['x-elastic-client-meta'].split(',')
      // et, js, t are always present; an `ag=<code>` pair is appended only when a
      // spawning agent harness is detected, so the length is 3 or 4.
      assert.ok(parts.length === 3 || parts.length === 4, `unexpected pair count: ${parts.length}`)
      assert.match(parts[0]!, /^et=/)
      assert.match(parts[1]!, /^js=/)
      assert.match(parts[2]!, /^t=/)
      if (parts.length === 4) assert.match(parts[3]!, /^ag=[a-z]{1,3}$/)
    })

    it('uses comma-separated key=value pairs with no spaces', () => {
      assert.ok(!headers['x-elastic-client-meta'].includes(' '))
      const parts = headers['x-elastic-client-meta'].split(',')
      for (const part of parts) {
        assert.match(part, /^[a-z]+=.+$/)
      }
    })

    it('all version values (et, js, t) match the spec regex', () => {
      const specRegex = /^[0-9]{1,2}\.[0-9]{1,2}(?:\.[0-9]{1,3})?p?$/
      const parts = headers['x-elastic-client-meta'].split(',')
      // Only the version keys carry version values; the agent key (ag=) does not.
      for (const part of parts) {
        const [key, value] = part.split('=') as [string, string]
        if (key === 'ag') continue
        assert.match(value, specRegex, `value "${value}" in "${part}" does not match spec regex`)
      }
    })
  })
})

describe('clientHeaders telemetry toggle', () => {
  const ORIGINAL_ENV = process.env.ELASTIC_CLI_TELEMETRY

  afterEach(() => {
    _testResetConfig()
    if (ORIGINAL_ENV === undefined) delete process.env.ELASTIC_CLI_TELEMETRY
    else process.env.ELASTIC_CLI_TELEMETRY = ORIGINAL_ENV
  })

  it('includes x-elastic-client-meta by default (opt-out, no config)', () => {
    delete process.env.ELASTIC_CLI_TELEMETRY
    _testResetConfig()
    assert.ok('x-elastic-client-meta' in clientHeaders())
  })

  it('includes x-elastic-client-meta when config telemetry is true', () => {
    delete process.env.ELASTIC_CLI_TELEMETRY
    setResolvedConfig({ context: {}, telemetry: true } as ResolvedConfig)
    assert.ok('x-elastic-client-meta' in clientHeaders())
  })

  it('omits x-elastic-client-meta when config telemetry is false', () => {
    delete process.env.ELASTIC_CLI_TELEMETRY
    setResolvedConfig({ context: {}, telemetry: false } as ResolvedConfig)
    const headers = clientHeaders()
    assert.ok(!('x-elastic-client-meta' in headers))
    assert.ok('user-agent' in headers)
  })

  it('env ELASTIC_CLI_TELEMETRY=false disables regardless of config', () => {
    process.env.ELASTIC_CLI_TELEMETRY = 'false'
    setResolvedConfig({ context: {}, telemetry: true } as ResolvedConfig)
    assert.ok(!('x-elastic-client-meta' in clientHeaders()))
  })

  it('env ELASTIC_CLI_TELEMETRY=0 disables', () => {
    process.env.ELASTIC_CLI_TELEMETRY = '0'
    _testResetConfig()
    assert.ok(!('x-elastic-client-meta' in clientHeaders()))
  })

  it('env ELASTIC_CLI_TELEMETRY=true overrides config telemetry:false', () => {
    process.env.ELASTIC_CLI_TELEMETRY = 'true'
    setResolvedConfig({ context: {}, telemetry: false } as ResolvedConfig)
    assert.ok('x-elastic-client-meta' in clientHeaders())
  })
})

describe('clientHeaders detection gating', () => {
  // All env vars consumed by detectAgent() in @elastic/agent-env — must stay in sync with that package.
  const AGENT_VARS = [
    'AI_AGENT', 'AGENT',
    'CLAUDE_CODE_IS_COWORK', 'CLAUDECODE', 'CLAUDE_CODE',
    'CURSOR_AGENT', 'CURSOR_TRACE_ID',
    'CODEX_SANDBOX', 'CODEX_CI', 'CODEX_THREAD_ID',
    'GEMINI_CLI',
    'COPILOT_MODEL', 'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN',
    'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT', 'CLINE_ACTIVE',
    'CRUSH', 'GOOSE_TERMINAL', 'HERMES_SESSION_ID',
    'KILOCODE_FEATURE', 'AGENT_CONTEXT_OUT', 'OPENCLAW_SHELL',
    'OPENCODE_CLIENT', 'PI_CODING_AGENT', 'REPL_ID',
    'TRAE_AI_SHELL_ID', 'VTCODE', 'ZED_TERM', 'TERM_PROGRAM',
    'PI_MODEL', 'PI_PROVIDER', 'ANTHROPIC_MODEL',
  ]
  const snapshot = new Map(AGENT_VARS.map((k) => [k, process.env[k]]))
  const ORIGINAL_TELEMETRY = process.env.ELASTIC_CLI_TELEMETRY

  function clearAgentVars(): void {
    for (const k of AGENT_VARS) delete process.env[k]
  }

  afterEach(() => {
    clearAgentVars()
    for (const [k, v] of snapshot) if (v !== undefined) process.env[k] = v
    if (ORIGINAL_TELEMETRY === undefined) delete process.env.ELASTIC_CLI_TELEMETRY
    else process.env.ELASTIC_CLI_TELEMETRY = ORIGINAL_TELEMETRY
    _testResetConfig()
    _testResetDetection()
  })

  it('omits agent/LLM details from the user-agent when telemetry is disabled', () => {
    _testResetDetection()
    clearAgentVars()
    process.env.PI_CODING_AGENT = 'true'
    process.env.PI_MODEL = 'anthropic/model-x'
    process.env.ELASTIC_CLI_TELEMETRY = 'false'
    const headers = clientHeaders()
    assert.ok(!('x-elastic-client-meta' in headers))
    assert.ok(!headers['user-agent'].includes('model-x'))
  })

  it('does not call detectAgent while telemetry is disabled (no stale detection cached)', () => {
    // Disabled first with model-a in env. If detection ran here it would cache model-a.
    _testResetDetection()
    clearAgentVars()
    process.env.PI_CODING_AGENT = 'true'
    process.env.PI_MODEL = 'anthropic/model-a'
    process.env.ELASTIC_CLI_TELEMETRY = 'false'
    clientHeaders()
    // Enable with model-b; a fresh detection must pick up model-b, proving the
    // disabled call never invoked detectAgent (no stale model-a memoized).
    process.env.PI_MODEL = 'anthropic/model-b'
    process.env.ELASTIC_CLI_TELEMETRY = 'true'
    _testResetConfig()
    assert.match(clientHeaders()['user-agent'], /; anthropic\/model-b\)$/)
  })

  it('appends the LLM segment and ag= meta when telemetry is enabled', () => {
    _testResetDetection()
    clearAgentVars()
    process.env.PI_CODING_AGENT = 'true'
    process.env.PI_MODEL = 'anthropic/model-c'
    process.env.ELASTIC_CLI_TELEMETRY = 'true'
    _testResetConfig()
    const headers = clientHeaders()
    assert.match(headers['user-agent'], /; anthropic\/model-c\)$/)
    assert.match(headers['x-elastic-client-meta']!, /,ag=pi$/)
  })
})

describe('agentMetaSegment', () => {
  it('returns empty when no agent is detected', () => {
    assert.equal(agentMetaSegment({}), '')
  })

  it('returns ,ag=<code> for a detected known agent', () => {
    assert.equal(agentMetaSegment({ CLAUDECODE: '1' }), ',ag=cc')
  })

  it('returns empty for a detected agent that has no short code', () => {
    assert.equal(agentMetaSegment({ AI_AGENT: 'devin' }), '')
  })
})

describe('llmUserAgentSegment', () => {
  it('returns empty when no LLM is detected', () => {
    assert.equal(llmUserAgentSegment({}), '')
  })

  it('returns vendor/model when vendor prefix is present', () => {
    assert.equal(llmUserAgentSegment({ PI_CODING_AGENT: 'true', PI_MODEL: 'anthropic/claude-sonnet-4-5' }), 'anthropic/claude-sonnet-4-5')
  })

  it('returns just model when no vendor is available', () => {
    assert.equal(llmUserAgentSegment({ PI_CODING_AGENT: 'true', PI_MODEL: 'some-custom-model' }), 'some-custom-model')
  })
})