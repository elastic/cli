/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { NAMESPACES } from '../src/namespaces.ts'
import { setResolvedConfig, _testResetConfig } from '../src/config/store.ts'
import type { ResolvedConfig } from '../src/config/types.ts'
import { getKibanaClient, _testResetKibanaClient } from '../src/lib/kibana-client.ts'

function withKibanaVersion (version: string): void {
  setResolvedConfig({ context: { kibana: { version } } } as unknown as ResolvedConfig)
}

describe('nightshift namespace', () => {
  const ns = NAMESPACES.find(n => n.name === 'nightshift')!
  afterEach(() => { _testResetConfig() })

  it('sends `ask` to the Nightshift assistant agent', async (t) => {
    setResolvedConfig({ context: { kibana: { url: 'http://localhost:5601' } } } as unknown as ResolvedConfig)
    t.after(() => { _testResetKibanaClient() })
    const bodies: unknown[] = []
    getKibanaClient()._testSetFetch(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response('{"conversation_id":"c1"}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    t.after(() => { Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true }) })
    t.mock.method(process.stdout, 'write', () => true)

    const group = await ns.load()
    group.exitOverride()
    await group.parseAsync(['ask', 'why is checkout slow?'], { from: 'user' })

    assert.deepEqual(bodies, [{ agent_id: 'nightshift.assistant', message: 'why is checkout slow?' }])
  })

  it('exposes the generated chat message command as `ask` without an agent flag', async () => {
    assert.ok(ns != null)
    const group = await ns.load()
    assert.equal(group.name(), 'nightshift')
    const ask = group.commands.find(c => c.name() === 'ask')
    assert.ok(ask != null)
    const flags = ask.options.map(o => o.long)
    assert.ok(flags.includes('--message'))
    assert.equal(flags.includes('--agent-id'), false)
    assert.deepEqual(ask.registeredArguments.map(a => a.name()), ['message'])
  })

  it('offers `ask` when the Kibana version hint is serverless', async () => {
    withKibanaVersion('serverless')
    const group = await ns.load()
    assert.ok(group.commands.some(c => c.name() === 'ask'))
  })

  for (const version of ['9.5', '9.6', '9.7']) {
    it(`hides \`ask\` when the Kibana version hint is stack ${version}`, async () => {
      withKibanaVersion(version)
      const group = await ns.load()
      assert.equal(group.commands.some(c => c.name() === 'ask'), false)
    })
  }

  it('keeps `ask` in the eager tree regardless of the version hint', async () => {
    withKibanaVersion('9.5')
    const group = await ns.load({ eager: true })
    assert.ok(group.commands.some(c => c.name() === 'ask'))
  })
})
