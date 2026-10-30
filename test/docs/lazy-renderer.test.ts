/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CLI_ENTRY = join(process.cwd(), 'src', 'cli.ts')
const RENDERER_ENTRY = pathToFileURL(join(process.cwd(), 'src', 'docs', 'renderer.ts')).href

// The recorder hook runs on Node's loader thread (module.register), which Bun
// does not implement.
const IS_BUN = 'bun' in process.versions

// Appends every import specifier to the file named by RESOLVE_LOG. The same
// file is the --import entry (registers itself, main thread only) and the hook module.
const HOOK_SOURCE = `
import { register } from 'node:module'
import { appendFileSync } from 'node:fs'
import { isMainThread } from 'node:worker_threads'
if (isMainThread) register(import.meta.url)
export async function resolve (specifier, context, next) {
  appendFileSync(process.env.RESOLVE_LOG, specifier + '\\n')
  return next(specifier, context)
}
`

describe('docs markdown renderer is lazy-loaded', { skip: IS_BUN }, () => {
  let dir: string
  let hook: string

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'elastic-cli-lazy-renderer-'))
    hook = join(dir, 'record-resolve.mjs')
    await writeFile(hook, HOOK_SOURCE)
  })

  after(async () => {
    await rm(dir, { recursive: true })
  })

  async function resolvedSpecifiers (nodeArgs: string[]): Promise<string[]> {
    const log = join(dir, `${Math.random().toString(36).slice(2)}.log`)
    await writeFile(log, '')
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, [
        '--import', 'tsx/esm',
        '--import', pathToFileURL(hook).href,
        ...nodeArgs,
      ], {
        stdio: ['ignore', 'ignore', 'pipe'],
        // Empty NODE_V8_COVERAGE keeps child coverage out of the parent's report.
        env: { ...process.env, NODE_V8_COVERAGE: '', RESOLVE_LOG: log, HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir },
      })
      child.stderr.resume()
      child.on('close', resolve)
    })
    assert.equal(code, 0)
    return (await readFile(log, 'utf8')).split('\n')
  }

  it('recorder sees marked-terminal when the renderer is imported (control)', async () => {
    const specifiers = await resolvedSpecifiers(['--input-type=module', '-e', `await import(${JSON.stringify(RENDERER_ENTRY)})`])
    assert.ok(specifiers.includes('marked-terminal'))
  })

  it('`docs --help` does not load marked-terminal', async () => {
    const specifiers = await resolvedSpecifiers([CLI_ENTRY, 'docs', '--help'])
    assert.ok(specifiers.some((s) => s.endsWith('/docs/register.ts')), 'docs commands were not loaded')
    assert.ok(!specifiers.includes('marked-terminal'))
  })

  it('shell completion of `docs` subcommands does not load marked-terminal', async () => {
    const specifiers = await resolvedSpecifiers([CLI_ENTRY, '__complete', '--', 'docs', ''])
    assert.ok(specifiers.some((s) => s.endsWith('/docs/register.ts')), 'docs commands were not loaded')
    assert.ok(!specifiers.includes('marked-terminal'))
  })
})
