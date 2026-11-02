/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { capture, captureDuring } from './capture.ts'
import { mockTransport } from './transport.ts'

describe('capture', () => {
  it('captures string writes to both streams and restores them afterwards', async () => {
    const realStdout = process.stdout.write
    const realStderr = process.stderr.write
    const captured = await captureDuring(() => {
      process.stdout.write('out')
      process.stderr.write('err')
    })
    assert.deepEqual(captured, { stdout: ['out'], stderr: ['err'] })
    assert.equal(process.stdout.write, realStdout)
    assert.equal(process.stderr.write, realStderr)
  })

  it('restores the streams when the captured function throws', async () => {
    const realStdout = process.stdout.write
    await assert.rejects(captureDuring(() => { throw new Error('boom') }), /boom/)
    assert.equal(process.stdout.write, realStdout)
  })

  it('forwards non-string chunks to the real stream instead of capturing them', async () => {
    const captured = await captureDuring(() => process.stdout.write(new Uint8Array(0)))
    assert.deepEqual(captured.stdout, [])
  })

  it('captures for the rest of the test when given a TestContext', (t) => {
    const { stdout } = capture(t)
    process.stdout.write('kept')
    assert.deepEqual(stdout, ['kept'])
  })
})

describe('mockTransport', () => {
  it('replays responses in order, then repeats the last one', async () => {
    const { transport, requests } = mockTransport(['a', 'b'])
    const seen = [
      await transport.request({ method: 'GET', path: '/1' }),
      await transport.request({ method: 'GET', path: '/2' }),
      await transport.request({ method: 'GET', path: '/3' }),
    ]
    assert.deepEqual(seen, ['a', 'b', 'b'])
    assert.deepEqual(requests.map((r) => r.params.path), ['/1', '/2', '/3'])
  })

  it('answers with whenExhausted once the queue is empty', async () => {
    const { transport } = mockTransport(['a'], 'done')
    assert.deepEqual([await transport.request({ method: 'GET', path: '/' }), await transport.request({ method: 'GET', path: '/' })], ['a', 'done'])
  })
})
