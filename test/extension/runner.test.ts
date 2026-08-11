/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runExtension, _testSetSpawn } from '../../src/extension/runner.ts'
import type { InstalledExtension } from '../../src/extension/store.ts'

const fakeExt: InstalledExtension = {
  name: 'test',
  source: 'local:/tmp/elastic-test',
  path: '/tmp/elastic-test',
  entrypoint: '/tmp/elastic-test/index.js',
}

afterEach(() => {
  _testSetSpawn(undefined)
})

describe('runExtension', () => {
  it('passes contextEnv vars to the child process', async () => {
    let capturedEnv: Record<string, string | undefined> | undefined

    _testSetSpawn((_cmd, _args, options) => {
      capturedEnv = options?.env as Record<string, string | undefined>
      const emitter = new EventEmitter() as ReturnType<typeof import('node:child_process').spawn>
      process.nextTick(() => emitter.emit('close', 0))
      return emitter
    })

    await runExtension(fakeExt, [], { ELASTIC_ES_URL: 'https://localhost:9200' })

    assert.ok(capturedEnv != null, 'env must be captured')
    assert.equal(capturedEnv['ELASTIC_ES_URL'], 'https://localhost:9200')
  })

  it('does not pass ambient secrets to the child process', async () => {
    const sentinel = 'super-secret-sentinel-value'
    const originalEnv = process.env
    // Inject a secret into process.env temporarily
    ;(process as NodeJS.Process).env = { ...process.env, GITHUB_TOKEN: sentinel, NPM_TOKEN: sentinel, AWS_SECRET_ACCESS_KEY: sentinel }

    let capturedEnv: Record<string, string | undefined> | undefined
    try {
      _testSetSpawn((_cmd, _args, options) => {
        capturedEnv = options?.env as Record<string, string | undefined>
        const emitter = new EventEmitter() as ReturnType<typeof import('node:child_process').spawn>
        process.nextTick(() => emitter.emit('close', 0))
        return emitter
      })

      await runExtension(fakeExt, [], {})
    } finally {
      ;(process as NodeJS.Process).env = originalEnv
      _testSetSpawn(undefined)
    }

    assert.ok(capturedEnv != null, 'env must be captured')
    assert.ok(!('GITHUB_TOKEN' in capturedEnv), 'GITHUB_TOKEN must not reach child process')
    assert.ok(!('NPM_TOKEN' in capturedEnv), 'NPM_TOKEN must not reach child process')
    assert.ok(!('AWS_SECRET_ACCESS_KEY' in capturedEnv), 'AWS_SECRET_ACCESS_KEY must not reach child process')
  })

  it('contextEnv vars are merged on top of the scrubbed base env', async () => {
    let capturedEnv: Record<string, string | undefined> | undefined

    _testSetSpawn((_cmd, _args, options) => {
      capturedEnv = options?.env as Record<string, string | undefined>
      const emitter = new EventEmitter() as ReturnType<typeof import('node:child_process').spawn>
      process.nextTick(() => emitter.emit('close', 0))
      return emitter
    })

    await runExtension(fakeExt, [], {
      ELASTIC_ES_URL: 'https://es:9200',
      ELASTIC_ES_API_KEY: 'key123',
    })

    assert.ok(capturedEnv != null)
    assert.equal(capturedEnv['ELASTIC_ES_URL'], 'https://es:9200')
    assert.equal(capturedEnv['ELASTIC_ES_API_KEY'], 'key123')
  })

  it('resolves with the child exit code', async () => {
    _testSetSpawn((_cmd, _args, _options) => {
      const emitter = new EventEmitter() as ReturnType<typeof import('node:child_process').spawn>
      process.nextTick(() => emitter.emit('close', 42))
      return emitter
    })

    const code = await runExtension(fakeExt, [], {})
    assert.equal(code, 42)
  })

  it('rejects when the child process fails to start', async () => {
    _testSetSpawn((_cmd, _args, _options) => {
      const emitter = new EventEmitter() as ReturnType<typeof import('node:child_process').spawn>
      process.nextTick(() => emitter.emit('error', new Error('ENOENT')))
      return emitter
    })

    await assert.rejects(runExtension(fakeExt, [], {}), /Failed to start extension/)
  })
})
