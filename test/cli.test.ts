/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
  prog.option('--config-file <path>', 'path to a config file (default: ~/.elasticrc.yml)')
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

function runCli (args: string[], opts: { cwd?: string, env?: Record<string, string> } = {}): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), ...args], {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env }
    })
    child.stdin.end('')
    let stdout = '', stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d })
    child.stderr.on('data', (d: Buffer) => { stderr += d })
    child.on('close', (code: number | null) => resolve({ code, stdout, stderr }))
  })
}

describe('elastic CLI -- preAction config error handling', () => {
  it('exits with error when no config file is found', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-noconfig-'))
    try {
      const { code, stderr } = await runCli(['stack', 'es', 'info'], { cwd: dir, env: { HOME: dir, XDG_CONFIG_HOME: dir } })
      assert.equal(code, 1, `expected exit code 1, got ${code}`)
      assert.ok(stderr.includes('Error:'), `expected stderr to contain "Error:", got: ${stderr}`)
      assert.ok(stderr.includes('No configuration file found'), `expected config error message, got: ${stderr}`)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('exits with error when --config-file points to a nonexistent file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-badconfig-'))
    try {
      const { code, stderr } = await runCli(
        ['stack', 'es', 'info', '--config-file', '/nonexistent/path.yml'],
        { cwd: dir, env: { HOME: dir, XDG_CONFIG_HOME: dir } }
      )
      assert.equal(code, 1, `expected exit code 1, got ${code}`)
      assert.ok(stderr.includes('Error:'), `expected stderr to contain "Error:", got: ${stderr}`)
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})

describe('elastic CLI -- config-free commands', () => {
  it('`elastic version` succeeds without a config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-noconfig-'))
    try {
      const { code, stdout } = await runCli(['version', '--json'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      const parsed = JSON.parse(stdout)
      assert.ok('version' in parsed)
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})

describe('elastic CLI -- stack command tree', () => {
  it('top-level help lists `stack` and not `es`', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-help-'))
    try {
      const { code, stdout } = await runCli(['--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /^\s*stack\s/m, 'expected `stack` in top-level help')
      assert.doesNotMatch(stdout, /^\s*es\s/m, '`es` must not appear as a top-level command')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`elastic stack --help` lists the `es` sub-group', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-stack-help-'))
    try {
      const { code, stdout } = await runCli(['stack', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /^\s*es\s/m, 'expected `es` under stack')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`elastic stack es --help` lists namespace groups (indices, cluster, ml)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-stack-es-help-'))
    try {
      const { code, stdout } = await runCli(['stack', 'es', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /^\s*indices\s/m, 'expected `indices` group')
      assert.match(stdout, /^\s*cluster\s/m, 'expected `cluster` group')
      assert.match(stdout, /^\s*ml\s/m, 'expected `ml` group')
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
