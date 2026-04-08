/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clientHeaders } from '../../src/lib/meta.ts'
import { createRequire } from 'node:module'
import os from 'node:os'

const require = createRequire(import.meta.url)
const cliVersion: string = (require('../../package.json') as { version: string }).version
const transportVersion: string = (require('@elastic/transport/package.json') as { version: string }).version

describe('clientHeaders', () => {
  const headers = clientHeaders()

  describe('user-agent', () => {
    it('starts with elastic-cli/ and the CLI version', () => {
      assert.match(headers['user-agent'], new RegExp(`^elastic-cli/${cliVersion}`))
    })

    it('contains the OS platform and architecture', () => {
      assert.match(headers['user-agent'], new RegExp(`${os.platform()} ${os.arch()}`))
    })

    it('contains the Node.js version', () => {
      assert.match(headers['user-agent'], new RegExp(`Node\\.js ${process.version}`))
    })
  })

  describe('x-elastic-client-meta', () => {
    it('starts with ec= and the CLI version', () => {
      assert.match(headers['x-elastic-client-meta'], new RegExp(`^ec=${cliVersion}`))
    })

    it('contains the Node.js major.minor.patch version', () => {
      const nodeVer = process.versions.node
      assert.match(headers['x-elastic-client-meta'], new RegExp(`js=${nodeVer}`))
    })

    it('contains the transport version', () => {
      assert.match(headers['x-elastic-client-meta'], new RegExp(`t=${transportVersion}`))
    })

    it('uses comma-separated key=value pairs with no spaces', () => {
      assert.ok(!headers['x-elastic-client-meta'].includes(' '))
      const parts = headers['x-elastic-client-meta'].split(',')
      for (const part of parts) {
        assert.match(part, /^[a-z]+=.+$/)
      }
    })
  })
})
