/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractErrorEnvelope } from '../src/executor.ts'

test('returns undefined when stderr carries no envelope', () => {
  assert.equal(extractErrorEnvelope(''), undefined)
  assert.equal(extractErrorEnvelope('Warning: something\n'), undefined)
  assert.equal(extractErrorEnvelope('{"not":"an error"}\n'), undefined)
})

test('the last envelope wins, so earlier warnings do not shadow it', () => {
  const stderr = [
    '{"error":{"code":"first","message":"stale"}}',
    'Warning: secret value(s) passed via flag(s)',
    '{"error":{"code":"second","message":"real"}}',
  ].join('\n')
  assert.deepEqual(extractErrorEnvelope(stderr), { code: 'second', message: 'real' })
})

test('ES transport errors carry status_code and body instead of message', () => {
  const envelope = extractErrorEnvelope('{"error":{"code":"es_error","status_code":410,"body":{"reason":"gone"}}}')
  assert.deepEqual(envelope, { code: 'es_error', message: 'status 410: {"reason":"gone"}', status: 410 })
})

test('malformed JSON lines are skipped, not thrown on', () => {
  const stderr = '{"error":{"code":"good","message":"ok"}}\n{ broken\n'
  assert.deepEqual(extractErrorEnvelope(stderr), { code: 'good', message: 'ok' })
})
