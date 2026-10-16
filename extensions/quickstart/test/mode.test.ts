/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectMode } from '../src/mode.ts'

const bothTTY = { stdinIsTTY: true, stderrIsTTY: true }

test('--json forces agent mode even at a TTY', () => {
  assert.equal(detectMode(true, bothTTY), 'agent')
})

test('interactive requires both stdin and stderr to be TTYs', () => {
  assert.equal(detectMode(false, bothTTY), 'interactive')
  assert.equal(detectMode(false, { stdinIsTTY: true, stderrIsTTY: false }), 'agent')
  assert.equal(detectMode(false, { stdinIsTTY: false, stderrIsTTY: true }), 'agent')
  assert.equal(detectMode(false, { stdinIsTTY: false, stderrIsTTY: false }), 'agent')
})
