/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { clientHeaders, toMetaVersion } from '../../src/lib/meta.ts'
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

    it('has exactly 3 key-value pairs (et, js, t)', () => {
      const parts = headers['x-elastic-client-meta'].split(',')
      assert.equal(parts.length, 3)
    })

    it('uses comma-separated key=value pairs with no spaces', () => {
      assert.ok(!headers['x-elastic-client-meta'].includes(' '))
      const parts = headers['x-elastic-client-meta'].split(',')
      for (const part of parts) {
        assert.match(part, /^[a-z]+=.+$/)
      }
    })

    it('all version values match the spec regex', () => {
      const specRegex = /^[0-9]{1,2}\.[0-9]{1,2}(?:\.[0-9]{1,3})?p?$/
      const parts = headers['x-elastic-client-meta'].split(',')
      for (const part of parts) {
        const value = part.split('=')[1]!
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
