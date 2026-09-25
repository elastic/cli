/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QuickstartError, reportError, toEnvelope } from '../src/errors.ts'

class Collector {
  chunks: string[] = []
  write (chunk: string): boolean {
    this.chunks.push(chunk)
    return true
  }

  get text (): string {
    return this.chunks.join('')
  }
}

test('uncoded throwables still produce an envelope', () => {
  assert.deepEqual(toEnvelope(new Error('boom')), { code: 'internal_error', message: 'boom' })
  assert.deepEqual(toEnvelope('boom'), { code: 'internal_error', message: 'boom' })
})

test('the envelope is a single parseable JSON line on stderr', () => {
  const stderr = new Collector()
  const code = reportError(new QuickstartError('bad_env', 'Unknown --env "staging".'), stderr as never)
  assert.equal(code, 1)
  const firstLine = stderr.text.split('\n')[0] as string
  assert.deepEqual(JSON.parse(firstLine), { error: { code: 'bad_env', message: 'Unknown --env "staging".' } })
})

test('next steps render after the envelope, not inside it', () => {
  const stderr = new Collector()
  reportError(new QuickstartError('cli_not_found', 'No CLI.', ['npm install -g @elastic/cli']), stderr as never)
  const [firstLine] = stderr.text.split('\n')
  assert.deepEqual(JSON.parse(firstLine as string), { error: { code: 'cli_not_found', message: 'No CLI.' } })
  assert.match(stderr.text, /Next steps:\n {2}- npm install -g @elastic\/cli/)
})

test('exit code is carried by the error', () => {
  const stderr = new Collector()
  assert.equal(reportError(new QuickstartError('halt', 'stop', [], 2), stderr as never), 2)
})
