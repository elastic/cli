/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'

/**
 * Points `ELASTIC_CLI_CONFIG_FILE` at `<fresh temp dir>/<name>` for the rest of
 * the test and returns that path. The file is only written when `contents` is
 * given, so omitting it yields a path to a missing config. When the test
 * finishes the env var is restored and the directory removed.
 */
export async function tmpConfig (t: TestContext, contents?: string, name = 'config.yml'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-test-'))
  const path = join(dir, name)
  if (contents !== undefined) await writeFile(path, contents)
  const previous = process.env['ELASTIC_CLI_CONFIG_FILE']
  process.env['ELASTIC_CLI_CONFIG_FILE'] = path
  t.after(async () => {
    if (previous === undefined) delete process.env['ELASTIC_CLI_CONFIG_FILE']
    else process.env['ELASTIC_CLI_CONFIG_FILE'] = previous
    await rm(dir, { recursive: true, force: true })
  })
  return path
}
