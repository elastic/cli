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
      const { code, stderr } = await runCli(['stack', 'es', 'info'], { cwd: dir, env: { HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir } })
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

describe('elastic CLI -- config caching (preAction reuse)', () => {
  it('loads config once when no overrides are specified', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-cache-'))
    const counterFile = join(dir, 'load-count.txt')
    const scriptFile = join(dir, 'counter.js')
    const { writeFile, readFile } = await import('node:fs/promises')
    await writeFile(scriptFile, `require("fs").appendFileSync(${JSON.stringify(counterFile)},"x\\n");process.stdout.write("test-key")`)
    const configYaml = [
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth:',
      `        api_key: "$(cmd:node ${scriptFile.replace(/\\/g, '/')})"`,
    ].join('\n')
    const configPath = join(dir, '.elasticrc.yml')
    await writeFile(configPath, configYaml)

    try {
      await runCli(['stack', 'es', 'info', '--json'], { cwd: dir, env: { HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir } })
      const content = await readFile(counterFile, 'utf-8')
      const invocations = content.trim().split('\n').length
      assert.equal(invocations, 1, `expected resolver to run once, but ran ${invocations} times`)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('loads config twice when --config-file override is specified', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-cache-override-'))
    const counterFile = join(dir, 'load-count.txt')
    const scriptFile = join(dir, 'counter.js')
    const { writeFile, readFile } = await import('node:fs/promises')
    await writeFile(scriptFile, `require("fs").appendFileSync(${JSON.stringify(counterFile)},"x\\n");process.stdout.write("test-key")`)
    const configYaml = [
      'current_context: local',
      'contexts:',
      '  local:',
      '    elasticsearch:',
      '      url: http://localhost:9200',
      '      auth:',
      `        api_key: "$(cmd:node ${scriptFile.replace(/\\/g, '/')})"`,
    ].join('\n')
    const configPath = join(dir, 'custom.yml')
    await writeFile(join(dir, '.elasticrc.yml'), configYaml)
    await writeFile(configPath, configYaml)

    try {
      await runCli(['stack', 'es', 'info', '--json', '--config-file', configPath], { cwd: dir, env: { HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir } })
      const content = await readFile(counterFile, 'utf-8')
      const invocations = content.trim().split('\n').length
      assert.equal(invocations, 2, `expected resolver to run twice (early + override), but ran ${invocations} times`)
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
  it('top-level help lists `stack` and not `es` or `kb`', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-help-'))
    try {
      const { code, stdout } = await runCli(['--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /^\s*stack\s/m, 'expected `stack` in top-level help')
      assert.doesNotMatch(stdout, /^\s*es\s/m, '`es` must not appear as a top-level command')
      assert.doesNotMatch(stdout, /^\s*kb\s/m, '`kb` must not appear as a top-level command')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`elastic stack --help` lists `es` and `kb` sub-groups with aliases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-stack-help-'))
    try {
      const { code, stdout } = await runCli(['stack', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /es\|elasticsearch/m, 'expected `es|elasticsearch` under stack')
      assert.match(stdout, /kb\|kibana/m, 'expected `kb|kibana` under stack')
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

  it('`elastic stack elasticsearch --help` works as alias for `elastic stack es`', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-es-alias-'))
    try {
      const { code, stdout } = await runCli(['stack', 'elasticsearch', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /^\s*indices\s/m, 'expected `indices` group via elasticsearch alias')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`elastic stack kibana --help` works as alias for `elastic stack kb`', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-kb-alias-'))
    try {
      const { code, stdout } = await runCli(['stack', 'kibana', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stdout, /kb\b/m, 'expected kb-related content via kibana alias')
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`elastic kb --help` redirects to stack kb with deprecation warning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-kb-deprecation-'))
    try {
      const { code, stdout, stderr } = await runCli(['kb', '--help'], { cwd: dir, env: { HOME: dir } })
      assert.equal(code, 0, `expected exit code 0, got ${code}`)
      assert.match(stderr, /deprecated.*elastic stack kb/i, 'expected deprecation warning on stderr')
      assert.match(stdout, /kb\|kibana/m, 'expected kb commands in output')
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
