/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathSeparator, resolveCliBin, whichBin } from '../src/cli-bin.ts'
import { QuickstartError } from '../src/errors.ts'

async function fakeBin (name = 'elastic'): Promise<{ dir: string, path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'elastic-quickstart-bin-'))
  const path = join(dir, name)
  await writeFile(path, '#!/bin/sh\nexit 0\n', 'utf-8')
  await chmod(path, 0o755)
  return { dir, path }
}

const ok = async (): Promise<string> => JSON.stringify({ version: '0.3.0' })

// Filesystem cases run on the host platform: a Windows temp path contains a
// drive-letter colon, so a posix lookup there would split the path itself.
// The fake bin has no extension, hence the empty PATHEXT on Windows.
const HOST: NodeJS.Platform = process.platform
const HOST_SEP = pathSeparator(HOST)
const hostEnv = (path: string): NodeJS.ProcessEnv =>
  HOST === 'win32' ? { PATH: path, PATHEXT: '' } : { PATH: path }

test('whichBin finds an executable on PATH', async () => {
  const { dir, path } = await fakeBin()
  assert.equal(whichBin('elastic', hostEnv(dir), HOST), path)
})

test('whichBin ignores empty PATH segments and misses', async () => {
  const { dir, path } = await fakeBin()
  assert.equal(whichBin('elastic', hostEnv(`${HOST_SEP}${HOST_SEP}${dir}`), HOST), path)
  assert.equal(whichBin('nope', hostEnv(dir), HOST), undefined)
  assert.equal(whichBin('elastic', {}, HOST), undefined)
})

test('whichBin splits PATH on the separator, not on arbitrary punctuation', async () => {
  const { dir, path } = await fakeBin()
  const wrongSep = HOST_SEP === ':' ? ';' : ':'
  assert.equal(whichBin('elastic', hostEnv(`${dir}${HOST_SEP}${dir}`), HOST), path)
  assert.equal(whichBin('elastic', hostEnv(`${dir}${wrongSep}${dir}`), HOST), undefined)
})

// Pins the bug this helper exists to prevent: reading the separator from
// node:path makes it the host's, so a cross-platform lookup silently misses.
test('pathSeparator follows the platform argument, not the host', () => {
  assert.equal(pathSeparator('win32'), ';')
  assert.equal(pathSeparator('darwin'), ':')
  assert.equal(pathSeparator('linux'), ':')
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
      env: hostEnv(dir),
      platform: HOST,
      probe: async () => { throw new Error('exited with code 127') },
    }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed' && err.message.includes(path),
  )
})

test('unparseable or versionless probe output is a probe failure', async () => {
  const { dir } = await fakeBin()
  const deps = { env: hostEnv(dir), platform: HOST }
  await assert.rejects(
    resolveCliBin(undefined, { ...deps, probe: async () => 'Elastic CLI v0.3.0' }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed',
  )
  await assert.rejects(
    resolveCliBin(undefined, { ...deps, probe: async () => '{"nope":true}' }),
    (err: unknown) => err instanceof QuickstartError && err.code === 'cli_probe_failed',
  )
})
