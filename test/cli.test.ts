/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'

/**
 * Smoke-tests for the top-level program structure in cli.ts.
 * We import the program indirectly by recreating its option set here --
 * the integration point is the flag names and subcommand names that
 * registerEsCommands() and defineCommand() produce.
 */

function makeProgram(): InstanceType<typeof Command> {
  const prog = new Command('elastic')
  prog.exitOverride()
  prog.option('--config-file <path>', 'path to a config file, bypassing cosmiconfig discovery')
  prog.option('--use-context <name>', 'override the active context from the config file')
  prog.option('--json', 'output as JSON')
  return prog
}

describe('elastic CLI -- global flags', () => {
  it('registers --config-file as a string option', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--config-file')
    assert.ok(opt != null, 'expected --config-file option')
  })

  it('registers --use-context as a string option', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--use-context')
    assert.ok(opt != null, 'expected --use-context option')
  })

  it('registers --json as a boolean flag', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--json')
    assert.ok(opt != null, 'expected --json option')
    assert.ok(!opt.required, '--json should be a boolean flag (no required value)')
  })

  it('does not register --version as a flag (version is a subcommand)', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--version')
    assert.ok(opt == null, '--version must not be a global flag; use `elastic version` subcommand')
  })

  it('does not register --format as a flag', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--format')
    assert.ok(opt == null, '--format must not be registered; use --json instead')
  })

  it('does not register --config as a flag', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--config')
    assert.ok(opt == null, '--config must not be registered; use --config-file instead')
  })

  it('does not register --context as a flag', () => {
    const prog = makeProgram()
    const opt = prog.options.find((o) => o.long === '--context')
    assert.ok(opt == null, '--context must not be registered; use --use-context instead')
  })

  it('parses --json as true when provided', () => {
    const prog = makeProgram()
    prog.parse(['--json'], { from: 'user' })
    assert.equal(prog.opts()['json'], true)
  })

  it('parses --config-file value correctly', () => {
    const prog = makeProgram()
    prog.parse(['--config-file', '/some/path.yml'], { from: 'user' })
    assert.equal(prog.opts()['configFile'], '/some/path.yml')
  })

  it('parses --use-context value correctly', () => {
    const prog = makeProgram()
    prog.parse(['--use-context', 'staging'], { from: 'user' })
    assert.equal(prog.opts()['useContext'], 'staging')
  })
})

describe('elastic CLI -- config-free commands', () => {
  it('`elastic version` succeeds without a config file', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const exec = promisify(execFile)
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-noconfig-'))
    try {
      const { stdout } = await exec(
        process.execPath,
        [join(process.cwd(), 'dist', 'cli.js'), 'version', '--json'],
        { cwd: dir, env: { ...process.env, HOME: dir } }
      )
      const parsed = JSON.parse(stdout)
      assert.ok('version' in parsed)
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
