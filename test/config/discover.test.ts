/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasConfigSource, ENV_CONFIG_FILE } from '../../src/config/discover.ts'

describe('hasConfigSource', () => {
  const originalEnv = process.env[ENV_CONFIG_FILE]
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE

  afterEach(() => {
    restore(ENV_CONFIG_FILE, originalEnv)
    restore('HOME', originalHome)
    restore('USERPROFILE', originalUserProfile)
  })

  it('returns true when ELASTIC_CLI_CONFIG_FILE is set, without touching disk', async () => {
    // A path that does not exist: the env-var branch must short-circuit before
    // any home-directory discovery, so the early config gate still loads config
    // (and surfaces the proper error) for an explicit override. See #706.
    process.env[ENV_CONFIG_FILE] = '/nonexistent/elasticrc.yml'
    assert.equal(await hasConfigSource(), true)
  })

  it('discovers a config file in the home directory when the env var is unset', async () => {
    delete process.env[ENV_CONFIG_FILE]
    const home = await mkdtemp(join(tmpdir(), 'elastic-cli-has-config-'))
    try {
      setHome(home)
      await writeFile(join(home, '.elasticrc.yml'), 'contexts: {}\n')
      assert.equal(await hasConfigSource(), true)
    } finally {
      await rm(home, { recursive: true })
    }
  })

  it('returns false when the env var is unset and the home directory has no config', async () => {
    delete process.env[ENV_CONFIG_FILE]
    const home = await mkdtemp(join(tmpdir(), 'elastic-cli-no-config-'))
    try {
      setHome(home)
      assert.equal(await hasConfigSource(), false)
    } finally {
      await rm(home, { recursive: true })
    }
  })
})

/** Points `os.homedir()` at `dir` on both POSIX (`HOME`) and Windows (`USERPROFILE`). */
function setHome (dir: string): void {
  process.env.HOME = dir
  process.env.USERPROFILE = dir
}

function restore (key: string, value: string | undefined): void {
  if (value == null) delete process.env[key]
  else process.env[key] = value
}
