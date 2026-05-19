/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bashWrapper } from '../../src/completion/shells/bash.ts'
import { zshWrapper } from '../../src/completion/shells/zsh.ts'
import { fishWrapper } from '../../src/completion/shells/fish.ts'

describe('bashWrapper', () => {
  it('is a non-empty string containing the bash completion glue', () => {
    const script = bashWrapper()
    assert.ok(typeof script === 'string')
    assert.ok(script.length > 0)
    assert.ok(script.includes('complete -F'), 'expects a complete -F line')
    assert.ok(script.includes('__complete'), 'expects to invoke the hidden __complete command')
    assert.ok(script.includes('elastic'), 'expects to bind the elastic command name')
  })

  it('passes "--" before the argument list', () => {
    assert.ok(bashWrapper().includes(' -- '), 'must pass -- to disable option parsing')
  })

  it('emits valid bash syntax (bash -n)', () => {
    if (process.platform === 'win32') return
    const which = spawnSync('which', ['bash'])
    if (which.status !== 0) return
    const dir = mkdtempSync(join(tmpdir(), 'elastic-bash-wrapper-'))
    try {
      const path = join(dir, 'completion.bash')
      writeFileSync(path, bashWrapper(), 'utf-8')
      const result = spawnSync('bash', ['-n', path], { encoding: 'utf-8' })
      assert.equal(result.status, 0, `bash -n failed: ${result.stderr}`)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})

describe('zshWrapper', () => {
  it('is a non-empty string starting with #compdef', () => {
    const script = zshWrapper()
    assert.ok(script.startsWith('#compdef elastic'),
      `expected #compdef header, got: ${script.slice(0, 40)}`)
  })

  it('binds completion via compdef', () => {
    assert.ok(zshWrapper().includes('compdef '), 'expected compdef binding')
  })

  it('passes "--" before the argument list', () => {
    assert.ok(zshWrapper().includes(' -- '))
  })

  it('emits valid zsh syntax (zsh -n)', () => {
    if (process.platform === 'win32') return
    const which = spawnSync('which', ['zsh'])
    if (which.status !== 0) return // zsh not installed; skip
    const dir = mkdtempSync(join(tmpdir(), 'elastic-zsh-wrapper-'))
    try {
      const path = join(dir, '_elastic')
      writeFileSync(path, zshWrapper(), 'utf-8')
      const result = spawnSync('zsh', ['-n', path], { encoding: 'utf-8' })
      assert.equal(result.status, 0, `zsh -n failed: ${result.stderr}`)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})

describe('fishWrapper', () => {
  it('is a non-empty string with a complete -c elastic line', () => {
    const script = fishWrapper()
    assert.ok(typeof script === 'string')
    assert.ok(script.includes('complete -c elastic'),
      'expected "complete -c elastic" registration')
  })

  it('passes "--" before the argument list', () => {
    assert.ok(fishWrapper().includes(' -- '))
  })

  it('emits valid fish syntax (fish -n)', () => {
    if (process.platform === 'win32') return
    const which = spawnSync('which', ['fish'])
    if (which.status !== 0) return // fish not installed; skip
    const dir = mkdtempSync(join(tmpdir(), 'elastic-fish-wrapper-'))
    try {
      const path = join(dir, 'elastic.fish')
      writeFileSync(path, fishWrapper(), 'utf-8')
      const result = spawnSync('fish', ['-n', path], { encoding: 'utf-8' })
      assert.equal(result.status, 0, `fish -n failed: ${result.stderr}`)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})

describe('wrappers -- common shape', () => {
  it('all wrappers begin with a comment header naming the shell', () => {
    assert.match(bashWrapper(), /^#.*[Bb]ash/m)
    assert.match(zshWrapper(), /^#.*[Zz]sh/m)
    assert.match(fishWrapper(), /^#.*[Ff]ish/m)
  })
})
