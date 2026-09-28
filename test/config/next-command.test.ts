/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAuthFailure,
  isAuthStatus,
  setupNextCommand,
  withAuthHint,
  withSetupHint,
} from '../../src/config/next-command.ts'

describe('next-command hints', () => {
  it('names context add on TTY and env keys off TTY', () => {
    const tty = setupNextCommand(true)
    assert.match(tty, /elastic config context add/)
    assert.match(tty, /elastic status/)
    assert.equal(tty.includes('ELASTIC_CLI_CONFIG_FILE'), false)
    const ci = setupNextCommand(false)
    assert.match(ci, /ELASTIC_CLI_CONFIG_FILE/)
    assert.match(ci, /current_context/)
    assert.match(ci, /elastic config context add/)
    assert.match(withSetupHint('No configuration file found.', true), /elastic config context add/)
  })

  it('points 401 and 403 at status and context edit', () => {
    assert.equal(isAuthStatus(401), true)
    assert.equal(isAuthStatus(403), true)
    assert.equal(isAuthStatus(404), false)
    assert.match(formatAuthFailure(401), /elastic status --json/)
    assert.match(formatAuthFailure(403), /elastic config context edit/)
    assert.equal(withAuthHint('Kibana API error 404: missing', 404), 'Kibana API error 404: missing')
    assert.match(withAuthHint('Kibana API error 401: denied', 401), /elastic config context edit/)
  })
})
