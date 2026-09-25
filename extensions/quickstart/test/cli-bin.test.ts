/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCliBin, whichBin } from '../src/cli-bin.ts'
import { QuickstartError } from '../src/errors.ts'

async function fakeBin (name = 'elastic'): Promise<{ dir: string, path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'elastic-quickstart-bin-'))
  const path = join(dir, name)
  await writeFile(path, '#!/bin/sh\nexit 0\n', 'utf-8')
  await chmod(path, 0o755)
  return { dir, path }
}

const ok = async (): Promise<string> => JSON.stringify({ version: '0.3.0' })

test('whichBin finds an executable on PATH', async () => {
  const { dir, path } = await fakeBin()
  assert.equal(whichBin('elastic', { PATH: dir }, 'darwin'), path)
})

test('whichBin ignores empty PATH segments and misses', async () => {
  const { dir } = await fakeBin()
  assert.equal(whichBin('elastic', { PATH: `::${dir}` }, 'darwin'), join(dir, 'elastic'))
  assert.equal(whichBin('nope', { PATH: dir }, 'darwin'), undefined)
  assert.equal(whichBin('elastic', {}, 'darwin'), undefined)
})

test('a missing CLI fails before anything is provisioned', async () => {
  await assert.rejects(
    resolveCliBin(undefined, { env: { PATH: '' }, platform: 'darwin', probe: ok }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_not_found',
  )
})

test('--cli-bin must point at an executable', async () => {
  await assert.rejects(
    resolveCliBin('/definitely/not/here', { env: {}, platform: 'darwin', probe: ok }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_not_executable',
  )
})

test('--cli-bin bypasses PATH resolution', async () => {
  const { path } = await fakeBin('elastic-custom')
  const resolved = await resolveCliBin(path, { env: { PATH: '' }, platform: 'darwin', probe: ok })
  assert.deepEqual(resolved, { path, version: '0.3.0' })
})

test('a CLI that will not run is reported as a probe failure', async () => {
  const { dir, path } = await fakeBin()
  await assert.rejects(
    resolveCliBin(undefined, {
      env: { PATH: dir },
      platform: 'darwin',
      probe: async () => { throw new Error('exited with code 127') },
    }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed' && err.message.includes(path),
  )
})

test('unparseable or versionless probe output is a probe failure', async () => {
  const { dir } = await fakeBin()
  const deps = { env: { PATH: dir }, platform: 'darwin' as const }
  await assert.rejects(
    resolveCliBin(undefined, { ...deps, probe: async () => 'Elastic CLI v0.3.0' }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed',
  )
  await assert.rejects(
    resolveCliBin(undefined, { ...deps, probe: async () => '{"nope":true}' }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed',
  )
})
