/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { editInEditor } from '../../src/config/commands.ts'

// Fake editor: the CLI appends the file path as the last arg. Replaces the file with
// `{ editor: <tag>, path }` as JSON (valid YAML).
const FAKE_EDITOR = `
const { writeFileSync } = require('node:fs')
const [tag, path] = process.argv.slice(2)
writeFileSync(path, JSON.stringify({ editor: tag, path }))
`

const ENV_KEYS = ['VISUAL', 'EDITOR', 'TMPDIR', 'TEMP', 'TMP'] as const

describe('editInEditor', () => {
  let dir: string
  let editorCmd: (tag: string) => string
  const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'elastic-cli-editor-test-'))
    const script = join(dir, 'fake-editor.cjs')
    await writeFile(script, FAKE_EDITOR)
    editorCmd = tag => `"${process.execPath}" "${script}" ${tag}`
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
  after(async () => rm(dir, { recursive: true, force: true }))

  it('opens a fixed-name temp file regardless of the context name and runs no shell from it', async () => {
    delete process.env.VISUAL
    process.env.EDITOR = editorCmd('a')
    const pwned = join(dir, 'pwned')
    const names = ['a b', `x;touch "${pwned}"`, '$(id)', 'a/b', `x'y"z`, '`id`']
    for (const name of names) {
      const result = await editInEditor(name, {})
      assert.equal(result?.editor, 'a', name)
      assert.equal(basename(String(result?.path)), 'context.yml', name)
    }
    await assert.rejects(stat(pwned))
  })

  it('quotes the path when the temp dir contains spaces', async () => {
    const spaced = join(dir, 'with space')
    await mkdir(spaced)
    process.env.TMPDIR = process.env.TEMP = process.env.TMP = spaced
    delete process.env.VISUAL
    process.env.EDITOR = editorCmd('a')
    const result = await editInEditor('local', {})
    assert.equal(result?.editor, 'a')
    assert.ok(String(result?.path).startsWith(spaced))
  })

  it('prefers VISUAL over EDITOR', async () => {
    process.env.VISUAL = editorCmd('visual')
    process.env.EDITOR = editorCmd('editor')
    assert.equal((await editInEditor('local', {}))?.editor, 'visual')
  })

  it('skips an empty VISUAL and falls back to EDITOR', async () => {
    process.env.VISUAL = ''
    process.env.EDITOR = editorCmd('editor')
    assert.equal((await editInEditor('local', {}))?.editor, 'editor')
  })

  it('skips an empty EDITOR and falls back to VISUAL', async () => {
    process.env.EDITOR = ''
    process.env.VISUAL = editorCmd('visual')
    assert.equal((await editInEditor('local', {}))?.editor, 'visual')
  })
})
