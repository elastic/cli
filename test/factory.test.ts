/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  OptionDefinition,
  ParsedResult,
  CommandConfig,
  GroupConfig,
  OpaqueCommandHandle,
} from '../src/factory.ts'
import { defineCommand, defineGroup, _testSetStdinReader, isCommandAllowed, hideBlockedCommands, configureJsonHelp } from '../src/factory.ts'
import { setResolvedConfig, _testResetConfig } from '../src/config/store.ts'
import { Command } from 'commander'
import { z } from 'zod'
describe('factory types', () => {
  it('OptionDefinition accepts required fields', () => {
    const opt: OptionDefinition = {
      long: 'verbose',
      description: 'Show detailed output',
    }
    assert.equal(opt.long, 'verbose')
    assert.equal(opt.description, 'Show detailed output')
    assert.equal(opt.short, undefined)
    assert.equal(opt.type, undefined)
    assert.equal(opt.required, undefined)
    assert.equal(opt.defaultValue, undefined)
  })

  it('OptionDefinition accepts all optional fields', () => {
    const opt: OptionDefinition = {
      long: 'output',
      short: 'o',
      description: 'Output path',
      type: 'string',
      required: true,
      defaultValue: './out',
    }
    assert.equal(opt.short, 'o')
    assert.equal(opt.type, 'string')
    assert.equal(opt.required, true)
    assert.equal(opt.defaultValue, './out')
  })

  it('ParsedResult holds a typed options map', () => {
    const result: ParsedResult = {
      options: { verbose: true, timeout: 30, output: '/tmp/out' },
    }
    assert.equal(result.options['verbose'], true)
    assert.equal(result.options['timeout'], 30)
    assert.equal(result.options['output'], '/tmp/out')
  })

  it('CommandConfig requires name, description, and handler', () => {
    const handled: ParsedResult[] = []
    const config: CommandConfig = {
      name: 'health',
      description: 'Check cluster health',
      handler: (parsed) => { handled.push(parsed); return {} },
    }
    assert.equal(config.name, 'health')
    assert.equal(config.description, 'Check cluster health')
    assert.equal(typeof config.handler, 'function')
    assert.equal(config.options, undefined)
  })

  it('CommandConfig accepts an options array', () => {
    const config: CommandConfig = {
      name: 'deploy',
      description: 'Deploy a cluster',
      options: [{ long: 'dry-run', description: 'Preview only', type: 'boolean' }],
      handler: () => ({}),
    }
    assert.equal(config.options?.length, 1)
  })

  it('GroupConfig requires name and description', () => {
    const group: GroupConfig = {
      name: 'cluster',
      description: 'Manage Elasticsearch clusters',
    }
    assert.equal(group.name, 'cluster')
    assert.equal(group.description, 'Manage Elasticsearch clusters')
  })

  it('OpaqueCommandHandle type is importable', () => {
    // verifies the type import compiles without errors
    const handles: OpaqueCommandHandle[] = []
    assert.equal(handles.length, 0)
  })
})

describe('factory exports / cli.ts integration', () => {
  it('defineCommand and defineGroup are named exports of src/factory.ts', async () => {
    const factory = await import('../src/factory.ts')
    assert.equal(typeof factory.defineCommand, 'function')
    assert.equal(typeof factory.defineGroup, 'function')
  })

  it('a defineCommand handle can be registered on a Commander program (cli.ts pattern)', async () => {
    const { Command } = await import('commander')
    const { defineCommand } = await import('../src/factory.ts')
    const program = new Command()
    program.name('elastic')
    const healthCmd = defineCommand({
      name: 'health',
      description: 'Check cluster health',
      handler: () => ({}),
    })
    assert.doesNotThrow(() => program.addCommand(healthCmd))
    assert.equal(program.commands.length, 1)
    assert.equal(program.commands[0].name(), 'health')
  })

  it('a defineGroup handle (with children) can be registered on a Commander program', async () => {
    const { Command } = await import('commander')
    const { defineCommand, defineGroup } = await import('../src/factory.ts')
    const program = new Command()
    program.name('elastic')
    const healthCmd = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
    const statsCmd = defineCommand({ name: 'stats', description: 'Stats', handler: () => ({}) })
    const clusterGroup = defineGroup(
      { name: 'cluster', description: 'Manage clusters' },
      healthCmd,
      statsCmd,
    )
    assert.doesNotThrow(() => program.addCommand(clusterGroup))
    assert.equal(program.commands.length, 1)
    assert.equal(program.commands[0].name(), 'cluster')
    assert.equal(program.commands[0].commands.length, 2)
  })

  it('multiple handles can be registered on the same program', async () => {
    const { Command } = await import('commander')
    const { defineCommand, defineGroup } = await import('../src/factory.ts')
    const program = new Command()
    program.name('elastic')
    const cmd1 = defineCommand({ name: 'ping',    description: 'Ping',    handler: () => ({}) })
    const cmd2 = defineCommand({ name: 'version', description: 'Version', handler: () => ({}) })
    const grp  = defineGroup({ name: 'cluster', description: 'Clusters' },
      defineCommand({ name: 'health', description: 'Health', handler: () => ({}) }),
    )
    program.addCommand(cmd1)
    program.addCommand(cmd2)
    program.addCommand(grp)
    const names = program.commands.map((c) => c.name())
    assert.deepEqual(names, ['ping', 'version', 'cluster'])
  })
})

describe('defineCommand', () => {
  describe('skeleton', () => {
    it('returns a handle with the correct command name', () => {
      const handle = defineCommand({
        name: 'health',
        description: 'Check cluster health',
        handler: () => ({}),
      })
      assert.equal(handle.name(), 'health')
    })

    it('sets the command description from config', () => {
      const handle = defineCommand({
        name: 'status',
        description: 'Show status information',
        handler: () => ({}),
      })
      assert.equal(handle.description(), 'Show status information')
    })

    it('returns a handle registerable with addCommand()', async () => {
      const { Command } = await import('commander')
      const handle = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        handler: () => ({}),
      })
      const program = new Command('elastic')
      assert.doesNotThrow(() => program.addCommand(handle))
      const names = program.commands.map((c) => c.name())
      assert.ok(names.includes('deploy'))
    })

    it('each call produces an independent handle', () => {
      const a = defineCommand({ name: 'cmd-a', description: 'A', handler: () => ({}) })
      const b = defineCommand({ name: 'cmd-b', description: 'B', handler: () => ({}) })
      assert.notEqual(a, b)
      assert.equal(a.name(), 'cmd-a')
      assert.equal(b.name(), 'cmd-b')
    })
  })

  describe('positionalArg', () => {
    it('registers a required positional argument', () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search docs',
        positionalArg: { name: 'query', description: 'Search query', required: true },
        handler: () => ({}),
      })
      const args = cmd.registeredArguments
      assert.equal(args.length, 1)
      assert.equal(args[0].name(), 'query')
      assert.ok(args[0].required)
    })

    it('registers an optional positional argument', () => {
      const cmd = defineCommand({
        name: 'read',
        description: 'Read a page',
        positionalArg: { name: 'path', description: 'Docs path', required: false },
        handler: () => ({}),
      })
      const args = cmd.registeredArguments
      assert.equal(args.length, 1)
      assert.equal(args[0].required, false)
    })

    it('populates parsed.arg with the positional value', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search docs',
        positionalArg: { name: 'query', description: 'Search query', required: true },
        handler: (parsed) => { received.push(parsed); return {} },
      })
      cmd.exitOverride()
      await cmd.parseAsync(['ingest pipelines'], { from: 'user' })
      assert.equal(received.length, 1)
      assert.equal(received[0].arg, 'ingest pipelines')
    })

    it('sets parsed.arg to undefined when no positionalArg is declared', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'health',
        description: 'Health check',
        handler: (parsed) => { received.push(parsed); return {} },
      })
      cmd.exitOverride()
      await cmd.parseAsync([], { from: 'user' })
      assert.equal(received.length, 1)
      assert.equal(received[0].arg, undefined)
    })
  })

  describe('boolean flag parsing', () => {
    function invoke(handle: OpaqueCommandHandle, argv: string[]): void {
      handle.exitOverride()
      handle.parse(argv, { from: 'user' })
    }

    it('sets a boolean flag to true when --long form is provided', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'list',
        description: 'List resources',
        options: [{ long: 'verbose', description: 'Show detail', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--verbose'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['verbose'], true)
    })

    it('sets a boolean flag to false when absent', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'list',
        description: 'List resources',
        options: [{ long: 'verbose', description: 'Show detail', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, [])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['verbose'], false)
    })

    it('sets a boolean flag to true when -short form is provided', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'list',
        description: 'List resources',
        options: [{ long: 'verbose', short: 'v', description: 'Show detail', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['-v'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['verbose'], true)
    })

    it('boolean flag is false when absent even with a short alias defined', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'list',
        description: 'List resources',
        options: [{ long: 'verbose', short: 'v', description: 'Show detail', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, [])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['verbose'], false)
    })

    it('handler receives options map with only declared flags, no Commander internals', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'preview', description: 'Preview', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--preview'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['preview'], true)
      // no unexpected keys from Commander internals
      assert.deepEqual(Object.keys(received[0].options), ['preview'])
    })
  })

  describe('string option parsing', () => {
    function invoke(handle: OpaqueCommandHandle, argv: string[]): void {
      handle.exitOverride()
      handle.parse(argv, { from: 'user' })
    }

    it('passes a string option value to the handler', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output', description: 'Output path', type: 'string' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--output', '/tmp/out'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['output'], '/tmp/out')
    })

    it('omitted string option with no default is absent from the options map', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output', description: 'Output path', type: 'string' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, [])
      assert.equal(received.length, 1)
      assert.ok(!('output' in received[0].options), 'absent option with no default must not appear in options map')
    })

    it('omitted string option with a defaultValue uses the default', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output', description: 'Output path', type: 'string', defaultValue: './dist' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, [])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['output'], './dist')
    })

    it('provided value overrides defaultValue', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output', description: 'Output path', type: 'string', defaultValue: './dist' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--output', '/custom'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['output'], '/custom')
    })

    it('short alias form passes the string value', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output', short: 'o', description: 'Output path', type: 'string' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['-o', '/tmp'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['output'], '/tmp')
    })

    it('hyphenated option name is keyed by long name, not camelCase', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'build',
        description: 'Build',
        options: [{ long: 'output-dir', description: 'Output directory', type: 'string' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--output-dir', '/tmp'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['output-dir'], '/tmp')
      assert.ok(!('outputDir' in received[0].options), 'camelCase key must not appear')
    })
  })

  describe('numeric option parsing and coercion', () => {
    function invoke(handle: OpaqueCommandHandle, argv: string[]): void {
      handle.exitOverride()
      handle.parse(argv, { from: 'user' })
    }

    it('coerces a numeric string to a JS number', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'count', description: 'Count', type: 'number' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--count', '5'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['count'], 5)
      assert.equal(typeof received[0].options['count'], 'number')
    })

    it('coerces a float string to a JS number', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'ratio', description: 'Ratio', type: 'number' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--ratio', '3.14'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['ratio'], 3.14)
    })

    it('uses a numeric defaultValue as a number when option is absent', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'timeout', description: 'Timeout', type: 'number', defaultValue: 30 }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, [])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['timeout'], 30)
      assert.equal(typeof received[0].options['timeout'], 'number')
    })

    it('does not invoke handler and throws on non-numeric string', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'count', description: 'Count', type: 'number' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.throws(
        () => invoke(cmd, ['--count', 'abc']),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.match((err as Error).message, /count/i)
          return true
        },
      )
      assert.equal(received.length, 0, 'handler must not be called on coercion failure')
    })

    it('does not invoke handler and throws when NaN would result', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'count', description: 'Count', type: 'number' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.throws(
        () => invoke(cmd, ['--count', 'NaN']),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          return true
        },
      )
      assert.equal(received.length, 0, 'handler must not be called when value is NaN')
    })
  })

  describe('required option validation', () => {
    function invoke(handle: OpaqueCommandHandle, argv: string[]): void {
      handle.exitOverride()
      handle.parse(argv, { from: 'user' })
    }

    it('throws when a required string option is absent', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        options: [{ long: 'env', description: 'Target environment', type: 'string', required: true }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.throws(
        () => invoke(cmd, []),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.match((err as Error).message, /env/i)
          return true
        },
      )
      assert.equal(received.length, 0, 'handler must not be called when required option is missing')
    })

    it('throws when a required number option is absent', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'scale',
        description: 'Scale a resource',
        options: [{ long: 'replicas', description: 'Number of replicas', type: 'number', required: true }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.throws(
        () => invoke(cmd, []),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.match((err as Error).message, /replicas/i)
          return true
        },
      )
      assert.equal(received.length, 0, 'handler must not be called when required number option is missing')
    })

    it('does not throw when a required option is provided', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        options: [{ long: 'env', description: 'Target environment', type: 'string', required: true }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.doesNotThrow(() => invoke(cmd, ['--env', 'production']))
      assert.equal(received.length, 1)
      assert.equal(received[0].options['env'], 'production')
    })

    it('does not throw when a non-required option is absent', () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        options: [{ long: 'env', description: 'Target environment', type: 'string' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      assert.doesNotThrow(() => invoke(cmd, []))
      assert.equal(received.length, 1)
    })

    it('error message clearly identifies the missing required option', () => {
      const cmd = defineCommand({
        name: 'create',
        description: 'Create a resource',
        options: [{ long: 'name', description: 'Resource name', type: 'string', required: true }],
        handler: () => ({}),
      })
      assert.throws(
        () => invoke(cmd, []),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          const msg = (err as Error).message
          assert.match(msg, /name/i)
          return true
        },
      )
    })
  })

  describe('help text', () => {
    it('lists every option long name in the help output', () => {
      const cmd = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        options: [
          { long: 'verbose', description: 'Show detail', type: 'boolean' },
          { long: 'output', description: 'Output path', type: 'string' },
          { long: 'count', description: 'Number of items', type: 'number' },
        ],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.match(help, /--verbose/)
      assert.match(help, /--output/)
      assert.match(help, /--count/)
    })

    it('includes each option description in the help output', () => {
      const cmd = defineCommand({
        name: 'deploy',
        description: 'Deploy a resource',
        options: [
          { long: 'verbose', description: 'Show detail', type: 'boolean' },
          { long: 'output', description: 'Output path', type: 'string' },
          { long: 'count', description: 'Number of items', type: 'number' },
        ],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.match(help, /Show detail/)
      assert.match(help, /Output path/)
      assert.match(help, /Number of items/)
    })

    it('shows <string> placeholder for string options', () => {
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'output', description: 'Output path', type: 'string' }],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.match(help, /--output <string>/)
    })

    it('shows <number> placeholder for number options', () => {
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'count', description: 'Count', type: 'number' }],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.match(help, /--count <number>/)
    })

    it('shows numeric default as a number (not a quoted string)', () => {
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'timeout', description: 'Timeout', type: 'number', defaultValue: 30 }],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      // must show (default: 30) not (default: "30")
      assert.match(help, /\(default: 30\)/)
      assert.doesNotMatch(help, /\(default: "30"\)/)
    })

    it('shows string default in help output', () => {
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'format', description: 'Output format', type: 'string', defaultValue: 'json' }],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.match(help, /default/)
      assert.match(help, /json/)
    })

    it('does not show a default marker when no defaultValue is set', () => {
      const cmd = defineCommand({
        name: 'run',
        description: 'Run',
        options: [{ long: 'output', description: 'Output path', type: 'string' }],
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.doesNotMatch(help, /default/)
    })
  })
  describe('name validation', () => {
    it('throws when command name is empty', () => {
      assert.throws(
        () => defineCommand({ name: '', description: 'Test', handler: () => ({}) }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when command name contains uppercase letters', () => {
      assert.throws(
        () => defineCommand({ name: 'Health', description: 'Test', handler: () => ({}) }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when command name contains spaces', () => {
      assert.throws(
        () => defineCommand({ name: 'my command', description: 'Test', handler: () => ({}) }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when command name contains special characters', () => {
      assert.throws(
        () => defineCommand({ name: 'health_check', description: 'Test', handler: () => ({}) }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('accepts valid lowercase-alphanumeric-hyphen names', () => {
      assert.doesNotThrow(() => defineCommand({ name: 'health', description: 'Test', handler: () => ({}) }))
      assert.doesNotThrow(() => defineCommand({ name: 'dry-run', description: 'Test', handler: () => ({}) }))
      assert.doesNotThrow(() => defineCommand({ name: 'cmd123', description: 'Test', handler: () => ({}) }))
    })
  })

  describe('option short alias validation', () => {
    it('throws when short alias is more than one character', () => {
      assert.throws(
        () => defineCommand({
          name: 'health', description: 'Test',
          options: [{ long: 'verbose', short: 'vv', description: 'Verbose' }],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when short alias is empty string', () => {
      assert.throws(
        () => defineCommand({
          name: 'health', description: 'Test',
          options: [{ long: 'verbose', short: '', description: 'Verbose' }],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('accepts a valid single-character short alias', () => {
      assert.doesNotThrow(() => defineCommand({
        name: 'health', description: 'Test',
        options: [{ long: 'verbose', short: 'v', description: 'Verbose' }],
        handler: () => ({}),
      }))
    })
  })

  describe('option long name validation', () => {
    it('throws when long option name is a single character', () => {
      assert.throws(
        () => defineCommand({
          name: 'health', description: 'Test',
          options: [{ long: 'v', description: 'Verbose' }],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('accepts a long option name of two or more characters', () => {
      assert.doesNotThrow(() => defineCommand({
        name: 'health', description: 'Test',
        options: [{ long: 'vv', description: 'Double-verbose' }],
        handler: () => ({}),
      }))
    })
  })

  describe('duplicate option name validation', () => {
    it('throws when two options share the same long name', () => {
      assert.throws(
        () => defineCommand({
          name: 'health', description: 'Test',
          options: [
            { long: 'verbose', description: 'Verbose' },
            { long: 'verbose', description: 'Also verbose' },
          ],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when two options share the same short alias', () => {
      assert.throws(
        () => defineCommand({
          name: 'health', description: 'Test',
          options: [
            { long: 'verbose', short: 'v', description: 'Verbose' },
            { long: 'version', short: 'v', description: 'Version' },
          ],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('accepts options with distinct names and aliases', () => {
      assert.doesNotThrow(() => defineCommand({
        name: 'health', description: 'Test',
        options: [
          { long: 'verbose', short: 'v', description: 'Verbose' },
          { long: 'timeout', short: 't', description: 'Timeout' },
        ],
        handler: () => ({}),
      }))
    })
  })

  describe('help text format consistency', () => {
    it('two commands with different options both have a Usage section', () => {
      const cmd1 = defineCommand({ name: 'health', description: 'Check health', options: [{ long: 'verbose', type: 'boolean', description: 'Verbose' }], handler: () => ({}) })
      const cmd2 = defineCommand({ name: 'deploy', description: 'Deploy resource', options: [{ long: 'env', type: 'string', description: 'Environment' }], handler: () => ({}) })
      assert.match(cmd1.helpInformation(), /^Usage:/m)
      assert.match(cmd2.helpInformation(), /^Usage:/m)
    })

    it('two commands both have an Options section', () => {
      const cmd1 = defineCommand({ name: 'health', description: 'Check health', options: [{ long: 'verbose', type: 'boolean', description: 'Verbose' }], handler: () => ({}) })
      const cmd2 = defineCommand({ name: 'deploy', description: 'Deploy resource', options: [{ long: 'env', type: 'string', description: 'Environment' }], handler: () => ({}) })
      assert.match(cmd1.helpInformation(), /^Options:/m)
      assert.match(cmd2.helpInformation(), /^Options:/m)
    })

    it('both commands always include -h, --help in the Options section', () => {
      const cmd1 = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cmd2 = defineCommand({ name: 'deploy', description: 'Deploy', options: [{ long: 'env', type: 'string', description: 'Env' }], handler: () => ({}) })
      assert.match(cmd1.helpInformation(), /-h, --help/)
      assert.match(cmd2.helpInformation(), /-h, --help/)
    })

    it('sections appear in consistent order: Usage then description then Options', () => {
      const cmd1 = defineCommand({ name: 'health', description: 'Check health', options: [{ long: 'verbose', type: 'boolean', description: 'Verbose' }], handler: () => ({}) })
      const cmd2 = defineCommand({ name: 'deploy', description: 'Deploy resource', options: [{ long: 'count', type: 'number', description: 'Count' }], handler: () => ({}) })
      for (const help of [cmd1.helpInformation(), cmd2.helpInformation()]) {
        const usagePos = help.indexOf('Usage:')
        const optionsPos = help.indexOf('Options:')
        assert.ok(usagePos < optionsPos, 'Usage section must precede Options section')
      }
    })

    it('command description appears between Usage and Options', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check cluster health', options: [{ long: 'verbose', type: 'boolean', description: 'Verbose' }], handler: () => ({}) })
      const help = cmd.helpInformation()
      const usagePos = help.indexOf('Usage:')
      const descriptionPos = help.indexOf('Check cluster health')
      const optionsPos = help.indexOf('Options:')
      assert.ok(usagePos < descriptionPos, 'description must follow Usage')
      assert.ok(descriptionPos < optionsPos, 'description must precede Options')
    })
  })

  describe('error message consistency', () => {
    function captureErr(handle: OpaqueCommandHandle, argv: string[]): string {
      let err = ''
      handle.exitOverride()
      handle.configureOutput({ writeErr: (s) => { err += s } })
      try { handle.parse(argv, { from: 'user' }) } catch { /* CommanderError from exitOverride */ }
      return err
    }

    it('unrecognised option error starts with "Error:" (capital E)', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const err = captureErr(cmd, ['--unknown'])
      assert.match(err, /^Error:/m)
    })

    it('missing required option error starts with "Error:" (capital E)', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', options: [{ long: 'env', type: 'string', description: 'Env', required: true }], handler: () => ({}) })
      const err = captureErr(cmd, [])
      assert.match(err, /^Error:/m)
    })

    it('type coercion error starts with "Error:" (capital E)', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', options: [{ long: 'count', type: 'number', description: 'Count' }], handler: () => ({}) })
      const err = captureErr(cmd, ['--count', 'abc'])
      assert.match(err, /^Error:/m)
    })

    it('error output includes a Usage line', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const err = captureErr(cmd, ['--unknown'])
      assert.match(err, /Usage:/)
    })

    it('error output includes a --help hint', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const err = captureErr(cmd, ['--unknown'])
      assert.match(err, /--help/)
    })

    it('two different commands produce the same error structure for unrecognised options', () => {
      const cmd1 = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cmd2 = defineCommand({ name: 'deploy', description: 'Deploy', handler: () => ({}) })
      const err1 = captureErr(cmd1, ['--unknown'])
      const err2 = captureErr(cmd2, ['--unknown'])
      assert.match(err1, /^Error:/m)
      assert.match(err2, /^Error:/m)
      assert.match(err1, /Usage:/)
      assert.match(err2, /Usage:/)
      assert.match(err1, /--help/)
      assert.match(err2, /--help/)
    })

    it('error output includes the command name in the Usage line', () => {
      const cmd = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const err = captureErr(cmd, ['--unknown'])
      assert.match(err, /Usage:.*health/)
    })
  })

  describe('JSON input support', () => {
    it('registers --input-file <path> option when input is a Zod schema', () => {
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const helpText = cmd.helpInformation()
      assert.ok(helpText.includes('--input-file'), `expected --input-file in help text:\n${helpText}`)
    })

    it('does NOT register --input-file option when input is omitted', () => {
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        handler: () => ({}),
      })
      const helpText = cmd.helpInformation()
      assert.ok(!helpText.includes('--input-file'), `expected no --input-file in help text:\n${helpText}`)
    })

    it('throws at definition time when options contains long: \'input-file\' and input is a schema', () => {
      assert.throws(
        () => defineCommand({
          name: 'query',
          description: 'Run a query',
          input: z.object({ q: z.string() }),
          options: [{ long: 'input-file', description: 'A conflicting option' }],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('does NOT throw when options contains long: \'input-file\' but input is omitted', () => {
      assert.doesNotThrow(() => defineCommand({
        name: 'query',
        description: 'Run a query',
        options: [{ long: 'input-file', description: 'A file option' }],
        handler: () => ({}),
      }))
    })
  })

  describe('invalid input config', () => {
    it('throws when input is a plain object (not a ZodType)', () => {
      assert.throws(
        // @ts-expect-error intentional bad input for runtime validation test
        () => defineCommand({ name: 'search', description: 'Search', input: { index: 'my-index' }, handler: () => ({}) }),
        (e: unknown) => {
          assert.ok(e instanceof Error)
          assert.match(e.message, /command "search": input must be a Zod schema/)
          return true
        },
      )
    })

    it('throws when input is a string', () => {
      assert.throws(
        // @ts-expect-error intentional bad input for runtime validation test
        () => defineCommand({ name: 'search', description: 'Search', input: 'schema' as never, handler: () => ({}) }),
        (e: unknown) => {
          assert.ok(e instanceof Error)
          assert.match(e.message, /command "search": input must be a Zod schema/)
          return true
        },
      )
    })

    it('throws when input is a number', () => {
      assert.throws(
        // @ts-expect-error intentional bad input for runtime validation test
        () => defineCommand({ name: 'search', description: 'Search', input: 42 as never, handler: () => ({}) }),
        (e: unknown) => {
          assert.ok(e instanceof Error)
          assert.match(e.message, /command "search": input must be a Zod schema/)
          return true
        },
      )
    })
  })

  describe('JSON input via --input-file', () => {
    let tmpDir: string

    before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
    })
    after(() => {
      rmSync(tmpDir, { recursive: true })
    })

    let origIsTTY: boolean | undefined
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('handler receives parsed JSON in parsed.input when --input-file points to a valid JSON file', async () => {
      const filePath = join(tmpDir, 'valid.json')
      writeFileSync(filePath, JSON.stringify({ cluster: 'test', shards: 5 }))
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ cluster: z.string(), shards: z.number() }),
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await invokeAsync(cmd, ['--input-file', filePath])
      assert.equal(received.length, 1)
      assert.deepEqual(received[0].input, { cluster: 'test', shards: 5 })
    })

    it('errors with descriptive message when --input-file points to a nonexistent file', async () => {
      const nonexistent = join(tmpDir, 'does-not-exist.json')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', nonexistent])
      assert.match(err, /--input-file: file not found:/)
    })

    it('errors with descriptive message when --input-file points to a file with malformed JSON', async () => {
      const filePath = join(tmpDir, 'bad.json')
      writeFileSync(filePath, 'not { valid } json ][')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /--input-file: invalid JSON:/)
    })

    it('errors with "empty content" message when --input-file points to an empty file', async () => {
      const filePath = join(tmpDir, 'empty.json')
      writeFileSync(filePath, '')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /--input-file: invalid JSON: empty content/)
    })

    it('validation error when input is a schema with required fields, no --input-file provided, and stdin is a TTY', async () => {
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, [])
      assert.match(err, /input validation failed/i)
    })

    it('reads from stdin when --input-file is "-" (stdin sentinel)', async () => {
      const restore = _testSetStdinReader(() => JSON.stringify({ cluster: 'test', shards: 5 }))
      try {
        const received: ParsedResult[] = []
        const cmd = defineCommand({
          name: 'query',
          description: 'Run a query',
          input: z.object({ cluster: z.string(), shards: z.number() }),
          handler: (parsed) => { received.push(parsed); return {} },
        })
        await invokeAsync(cmd, ['--input-file', '-'])
        assert.equal(received.length, 1)
        assert.deepEqual(received[0].input, { cluster: 'test', shards: 5 })
      } finally {
        restore()
      }
    })

    it('errors with --input-file source label when stdin (via "-") contains malformed JSON', async () => {
      const restore = _testSetStdinReader(() => 'not { valid } json ][')
      try {
        const cmd = defineCommand({
          name: 'query',
          description: 'Run a query',
          input: z.object({ q: z.string() }),
          handler: () => ({}),
        })
        const err = await captureErrAsync(cmd, ['--input-file', '-'])
        assert.match(err, /--input-file: invalid JSON:/)
      } finally {
        restore()
      }
    })

    it('errors with "empty content" when --input-file is "-" and stdin is empty', async () => {
      const restore = _testSetStdinReader(() => '')
      try {
        const cmd = defineCommand({
          name: 'query',
          description: 'Run a query',
          input: z.object({ q: z.string() }),
          handler: () => ({}),
        })
        const err = await captureErrAsync(cmd, ['--input-file', '-'])
        assert.match(err, /--input-file: invalid JSON: empty content/)
      } finally {
        restore()
      }
    })
  })

  describe('JSON input via stdin', () => {
    let origIsTTY: boolean | undefined
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('handler receives parsed JSON in parsed.input when valid JSON is piped to stdin', async () => {
      const restore = _testSetStdinReader(() => JSON.stringify({ index: 'my-index', size: 10 }))
      try {
        const received: ParsedResult[] = []
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
        input: z.object({ index: z.string(), size: z.number() }),
          handler: (parsed) => { received.push(parsed); return {} },
        })
        await invokeAsync(cmd, [])
        assert.equal(received.length, 1)
        assert.deepEqual(received[0].input, { index: 'my-index', size: 10 })
      } finally {
        restore()
      }
    })

    it('errors with descriptive message when malformed JSON is piped to stdin', async () => {
      const restore = _testSetStdinReader(() => 'not { valid json')
      try {
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
        input: z.object({ q: z.string() }),
          handler: () => ({}),
        })
        const err = await captureErrAsync(cmd, [])
        assert.match(err, /stdin: invalid JSON:/)
      } finally {
        restore()
      }
    })

    it('treats empty stdin as no input (does not error)', async () => {
      const restore = _testSetStdinReader(() => '')
      try {
        const received: unknown[] = []
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
          input: z.object({ q: z.string().optional() }),
          handler: (p) => { received.push(p.input); return {} },
        })
        // empty stdin should not error; handler should be called with no input
        await invokeAsync(cmd, [])
        assert.equal(received.length, 1)
      } finally {
        restore()
      }
    })
  })

  describe('JSON input conflict resolution', () => {
    let tmpDir: string
    let origIsTTY: boolean | undefined

    before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
    })
    after(() => {
      rmSync(tmpDir, { recursive: true })
    })
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('--input-file takes precedence over stdin in non-TTY context', async () => {
      const filePath = join(tmpDir, 'input.json')
      writeFileSync(filePath, JSON.stringify({ index: 'my-index' }))
      const restore = _testSetStdinReader(() => JSON.stringify({ index: 'other-index' }))
      try {
        const received: ParsedResult[] = []
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
          input: z.object({ index: z.string() }),
          handler: (parsed) => { received.push(parsed); return {} },
        })
        await invokeAsync(cmd, ['--input-file', filePath])
        assert.strictEqual(received.length, 1)
        assert.deepStrictEqual(received[0]!.input, { index: 'my-index' })
      } finally {
        restore()
      }
    })

  })
  describe('schema input - type acceptance', () => {
    it('accepts a Zod object schema as input without throwing', () => {
      const schema = z.object({ index: z.string() })
      assert.doesNotThrow(() => {
        defineCommand({
          name: 'search',
          description: 'Search the cluster',
          input: schema,
          handler: () => ({}),
        })
      })
    })

    it('accepts input: undefined (no-input command)', () => {
      assert.doesNotThrow(() => {
        defineCommand({
          name: 'ping',
          description: 'Ping',
          handler: () => ({}),
        })
      })
    })
  })

  describe('schema input - valid input validation', () => {
    let tmpDir: string
    let origIsTTY: boolean | undefined

    before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
    })
    after(() => {
      rmSync(tmpDir, { recursive: true })
    })
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('handler receives Zod-parsed input when valid JSON is provided via --input-file', async () => {
      const schema = z.object({ index: z.string(), size: z.number() })
      const filePath = join(tmpDir, 'valid.json')
      writeFileSync(filePath, JSON.stringify({ index: 'logs', size: 10 }))
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, ['--input-file', filePath])
      assert.deepEqual(received[0], { index: 'logs', size: 10 })
    })

    it('handler receives Zod-parsed input when valid JSON is piped via stdin', async () => {
      const schema = z.object({ index: z.string(), size: z.number() })
      const restore = _testSetStdinReader(() => JSON.stringify({ index: 'logs', size: 10 }))
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
      try {
        const received: unknown[] = []
        const cmd = defineCommand({
          name: 'search',
          description: 'Search',
          input: schema,
          handler: (parsed) => { received.push(parsed.input); return {} },
        })
        await invokeAsync(cmd, [])
        assert.deepEqual(received[0], { index: 'logs', size: 10 })
      } finally {
        restore()
      }
    })

    it('Zod default values are applied to missing optional fields', async () => {
      const schema = z.object({ index: z.string(), size: z.number().default(10) })
      const filePath = join(tmpDir, 'no-size.json')
      writeFileSync(filePath, JSON.stringify({ index: 'logs' }))
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, ['--input-file', filePath])
      assert.deepEqual(received[0], { index: 'logs', size: 10 })
    })

    it('extra properties in JSON are passed through (passthrough mode)', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'extra.json')
      writeFileSync(filePath, JSON.stringify({ index: 'logs', unexpected: 'field' }))
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, ['--input-file', filePath])
      assert.equal(received.length, 1)
      const input = received[0] as Record<string, unknown>
      assert.equal(input.index, 'logs')
      assert.equal(input.unexpected, 'field')
    })

    it('validation fails when schema has required fields but no input is provided', async () => {
      const schema = z.object({ index: z.string() })
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      // stdin is TTY (set in beforeEach), no --input-file flag, no CLI args
      const err = await captureErrAsync(cmd, [])
      assert.match(err, /input validation failed/i)
      assert.match(err, /index/)
    })

    it('handler is NOT invoked when required schema fields are missing and no input is provided', async () => {
      const schema = z.object({ index: z.string() })
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => { handlerCalled = true; return {} },
      })
      await captureErrAsync(cmd, [])
      assert.equal(handlerCalled, false)
    })

    it('all-optional schema succeeds with no input provided', async () => {
      const schema = z.object({ size: z.number().default(10), verbose: z.boolean().default(false) })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, [])
      assert.deepEqual(received[0], { size: 10, verbose: false })
    })
  })

  describe('schema input - validation error reporting', () => {
    let tmpDir: string
    let origIsTTY: boolean | undefined

    before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
    })
    after(() => {
      rmSync(tmpDir, { recursive: true })
    })
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('type mismatch error includes field path and expected type', async () => {
      const schema = z.object({ name: z.string() })
      const filePath = join(tmpDir, 'bad-type.json')
      writeFileSync(filePath, JSON.stringify({ name: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /name/)
      assert.match(err, /expected string/)
    })

    it('missing required field error identifies the field name', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'missing-field.json')
      writeFileSync(filePath, JSON.stringify({}))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /index/)
    })

    it('multiple validation errors are all reported', async () => {
      const schema = z.object({ name: z.string(), count: z.number() })
      const filePath = join(tmpDir, 'multi-error.json')
      writeFileSync(filePath, JSON.stringify({ name: 42, count: 'oops' }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /name/)
      assert.match(err, /count/)
    })

    it('handler is NOT invoked when validation fails', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'invalid-for-handler.json')
      writeFileSync(filePath, JSON.stringify({ index: 99 }))
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => { handlerCalled = true; return {} },
      })
      await captureErrAsync(cmd, ['--input-file', filePath])
      assert.equal(handlerCalled, false)
    })

    it('nested schema validation errors include full dot-separated path', async () => {
      const schema = z.object({ address: z.object({ zipCode: z.string() }) })
      const filePath = join(tmpDir, 'nested-error.json')
      writeFileSync(filePath, JSON.stringify({ address: { zipCode: 99999 } }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /address\.zipCode/)
    })

    it('union-typed field surfaces the matching variant instead of all variants (#172)', async () => {
      // Mirrors QueryDslQueryContainer-style validation: many variants, only
      // one of which the user's input aligns with.
      const schema = z.object({
        query: z.union([
          z.object({ bool: z.object({ must: z.array(z.unknown()) }) }),
          z.object({ match_all: z.object({}) }),
          z.object({ term: z.object({ category: z.object({ value: z.string() }) }) }),
          z.object({ range: z.object({ field: z.string() }) }),
        ])
      })
      const filePath = join(tmpDir, 'union-error.json')
      writeFileSync(filePath, JSON.stringify({ query: { term: { category: 'canyon' } } }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /query\.term\.category/)
      assert.match(err, /expected object/i)
      // None of the shallow "received undefined" discriminator noise leaks out
      assert.ok(!/received undefined/.test(err),
        `discriminator noise leaked: ${err}`)
      // And none of the non-matching variant keys surface as errors
      assert.ok(!/bool|match_all|range/.test(err),
        `non-matching variants leaked: ${err}`)
    })

    it('JSON mode emits a single actionable issue for union failures (#172)', async () => {
      const schema = z.object({
        query: z.union([
          z.object({ bool: z.object({ must: z.array(z.unknown()) }) }),
          z.object({ match_all: z.object({}) }),
          z.object({ term: z.object({ category: z.object({ value: z.string() }) }) }),
          z.object({ range: z.object({ field: z.string() }) }),
        ])
      })
      const filePath = join(tmpDir, 'union-json-error.json')
      writeFileSync(filePath, JSON.stringify({ query: { term: { category: 'canyon' } } }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const { stderr } = await invokeCapturingStreams(cmd, ['--json'], ['--input-file', filePath])
      const parsed = JSON.parse(stderr) as {
        error: {
          code: string
          message: string
          issues: Array<{ code: string; path: Array<string|number>; message: string }>
        }
      }
      assert.equal(parsed.error.code, 'input_validation_failed')
      assert.equal(parsed.error.issues.length, 1,
        `expected exactly one issue, got ${parsed.error.issues.length}: ${JSON.stringify(parsed.error.issues)}`)
      const [issue] = parsed.error.issues
      assert.equal(issue.code, 'invalid_type')
      assert.deepEqual(issue.path, ['query', 'term', 'category'])
      assert.match(issue.message, /expected object/i)
    })
  })

  describe('relaxed validation for JSON body fields (#156)', () => {
    let origIsTTY: boolean | undefined

    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })

    it('accepts object-typed body fields that fail strict Zod validation', async () => {
      const strictQuery = z.object({
        term: z.object({ value: z.string() })
      })
      const schema = z.object({
        index: z.string().optional().meta({ found_in: 'path' }),
        query: strictQuery.optional().meta({ found_in: 'body' }),
      })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      // Shorthand {"term":"canyon"} would fail strictQuery validation,
      // but the factory should relax it and pass through
      await invokeAsync(cmd, ['--query', '{"term":"canyon"}'])
      assert.equal(received.length, 1)
      const input = received[0] as Record<string, unknown>
      assert.deepEqual(input.query, { term: 'canyon' })
    })

    it('still validates path and query params strictly', async () => {
      const schema = z.object({
        index: z.string().meta({ found_in: 'path' }),
        size: z.number().optional().meta({ found_in: 'query' }),
      })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, ['--index', 'logs', '--size', '5'])
      const input = received[0] as Record<string, unknown>
      assert.equal(input.index, 'logs')
      assert.equal(input.size, 5)
    })

    it('relaxes array-typed body fields too', async () => {
      const strictItem = z.object({ action: z.string() })
      const schema = z.object({
        operations: z.array(strictItem).optional().meta({ found_in: 'body' }),
      })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'bulk',
        description: 'Bulk',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      // Pass items that don't match strictItem schema
      await invokeAsync(cmd, ['--operations', '[{"index":{}},{"name":"doc"}]'])
      assert.equal(received.length, 1)
      const input = received[0] as Record<string, unknown>
      assert.deepEqual(input.operations, [{ index: {} }, { name: 'doc' }])
    })

    // Regression: in Zod >=4.4, `.extend({ key: z.any() })` drops `.optional()`
    // from the replaced field, turning previously-optional JSON body fields
    // into required keys. The factory must re-apply `.optional()` on its
    // body-field overrides so omitted optional fields still validate.
    it('omitting an optional object body field still validates', async () => {
      const schema = z.object({
        index: z.string().meta({ found_in: 'path' }),
        aliases: z.record(z.string(), z.any()).optional().meta({ found_in: 'body' }),
        mappings: z.object({ properties: z.record(z.string(), z.any()) }).optional().meta({ found_in: 'body' }),
      })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'create',
        description: 'Create index',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      await invokeAsync(cmd, ['--index', 'foo'])
      assert.equal(received.length, 1)
      const input = received[0] as Record<string, unknown>
      assert.equal(input.index, 'foo')
    })

    it('required object body fields remain required after relaxation', async () => {
      const schema = z.object({
        service: z.string().meta({ found_in: 'body' }),
        service_settings: z.object({ api_key: z.string() }).meta({ found_in: 'body' }),
      })
      const cmd = defineCommand({
        name: 'put',
        description: 'Put inference',
        input: schema,
        handler: () => ({}),
      })
      // Missing required object body field should still fail validation.
      await assert.rejects(
        invokeAsync(cmd, ['--service', 'mistral']),
        /input validation failed|service_settings/i,
      )
    })
  })

  describe('commands without input schema', () => {
    it('command with no input does not register --input-file option', () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping',
        handler: () => ({}),
      })
      assert.ok(
        !cmd.helpInformation().includes('--input-file'),
        'expected no --input-file option when input is omitted',
      )
    })

    it('command with input: false throws at definition time', () => {
      assert.throws(
        // @ts-expect-error intentional: false is not a valid input value
        () => defineCommand({ name: 'ping', description: 'Ping', input: false, handler: () => ({}) }),
        (e: unknown) => {
          assert.ok(e instanceof Error)
          assert.match(e.message, /input must be a Zod schema/)
          return true
        },
      )
    })
  })

  describe('schema input - JSON format error output', () => {
    let tmpDir: string
    let origIsTTY: boolean | undefined

    before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
    })
    after(() => {
      rmSync(tmpDir, { recursive: true })
    })
    beforeEach(() => {
      origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
    })
    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
    })


    /** mounts cmd under a root program with --json, captures stdout + stderr, returns parsed JSON */
    async function invokeWithJsonFormat(cmd: OpaqueCommandHandle, argv: string[]): Promise<{ out: string, parsed: unknown }> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      let out = ''
      const origOut = process.stdout.write.bind(process.stdout)
      const origErr = process.stderr.write.bind(process.stderr)
      process.stdout.write = (chunk: unknown) => { out += String(chunk); return true }
      process.stderr.write = (chunk: unknown) => { out += String(chunk); return true }
      prog.configureOutput({ writeOut: (s) => { out += s }, writeErr: (s) => { out += s } })
      cmd.configureOutput({ writeOut: (s) => { out += s }, writeErr: (s) => { out += s } })
      try {
        await prog.parseAsync(['--json', cmd.name(), ...argv], { from: 'user' })
      } catch {
        // exitOverride throws on cmd.error(); that's expected
      } finally {
        process.stdout.write = origOut
        process.stderr.write = origErr
      }
      let parsed: unknown = null
      try { parsed = JSON.parse(out) } catch { /* not JSON - test will fail on assertion */ }
      return { out, parsed }
    }

    it('emits structured JSON error to stdout when --json and validation fails', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const { parsed } = await invokeWithJsonFormat(cmd, ['--input-file', filePath])
      assert.ok(parsed !== null, 'output was not valid JSON')
      const p = parsed as Record<string, unknown>
      assert.ok('error' in p, 'expected top-level "error" key')
      const err = p['error'] as Record<string, unknown>
      assert.equal(err['code'], 'input_validation_failed')
      assert.ok(typeof err['message'] === 'string' && err['message'].length > 0)
      assert.ok(Array.isArray(err['issues']) && (err['issues'] as unknown[]).length > 0)
    })

    it('error issues array contains field path and message', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad2.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const { parsed } = await invokeWithJsonFormat(cmd, ['--input-file', filePath])
      const issues = ((parsed as Record<string, unknown>)['error'] as Record<string, unknown>)['issues'] as Array<Record<string, unknown>>
      const issue = issues[0]!
      assert.ok(Array.isArray(issue['path']), 'expected path array')
      assert.ok(typeof issue['message'] === 'string')
      assert.deepEqual(issue['path'], ['index'])
    })

    it('handler is NOT invoked when --json and validation fails', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad3.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => { handlerCalled = true; return {} },
      })
      await invokeWithJsonFormat(cmd, ['--input-file', filePath])
      assert.equal(handlerCalled, false)
    })

    it('text mode (no --json flag) still uses cmd.error() with prettified output', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad4.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--input-file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /index/)
    })

    it('emits structured JSON error when --json and no input provided for required schema', async () => {
      const schema = z.object({ index: z.string() })
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const { parsed } = await invokeWithJsonFormat(cmd, [])
      assert.ok(parsed !== null, 'output was not valid JSON')
      const p = parsed as Record<string, unknown>
      assert.ok('error' in p, 'expected top-level "error" key')
      const err = p['error'] as Record<string, unknown>
      assert.equal(err['code'], 'input_validation_failed')
      assert.ok(Array.isArray(err['issues']) && (err['issues'] as unknown[]).length > 0)
    })
  })
  describe('global options', () => {
    async function mountUnderRoot(cmd: OpaqueCommandHandle, argv: string[]): Promise<void> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      await prog.parseAsync(argv, { from: 'user' })
    }

    it('global options from parent program appear in parsed.options', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'health',
        description: 'Check health',
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await mountUnderRoot(cmd, ['--json', 'health'])
      assert.equal(received.length, 1)
      assert.equal(received[0]!.options['json'], true)
    })

    it('global options are absent from parsed.options when not provided', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'health',
        description: 'Check health',
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await mountUnderRoot(cmd, ['health'])
      assert.equal(received.length, 1)
      assert.equal(received[0]!.options['json'], undefined)
    })

    it('command-level options and global options coexist in parsed.options', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        options: [{ long: 'index', type: 'string', description: 'Index name' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await mountUnderRoot(cmd, ['--json', 'search', '--index', 'logs'])
      assert.equal(received.length, 1)
      assert.equal(received[0]!.options['json'], true)
      assert.equal(received[0]!.options['index'], 'logs')
    })
  })

  describe('handler return value and output', () => {
    async function captureOutput(fn: () => Promise<void>): Promise<string> {
      let out = ''
      const orig = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: unknown) => { out += String(chunk); return true }
      try { await fn() } finally { process.stdout.write = orig }
      return out
    }

    async function invokeUnderRoot(cmd: OpaqueCommandHandle, rootArgv: string[], cmdArgv: string[]): Promise<string> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      return captureOutput(() => prog.parseAsync([...rootArgv, cmd.name(), ...cmdArgv], { from: 'user' }))
    }

    it('factory writes handler return value as compact JSON when --json', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Get status',
        handler: () => ({ ok: true, count: 3 }),
      })
      const out = await invokeUnderRoot(cmd, ['--json'], [])
      assert.deepEqual(JSON.parse(out), { ok: true, count: 3 })
    })

    it('factory writes handler return value as pretty-printed JSON in text mode', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Get status',
        handler: () => ({ ok: true }),
      })
      const out = await invokeUnderRoot(cmd, [], [])
      assert.equal(out, JSON.stringify({ ok: true }, null, 2) + '\n')
    })

    it('factory handles async handler return value', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Get status',
        handler: async () => ({ async: true }),
      })
      const out = await invokeUnderRoot(cmd, ['--json'], [])
      assert.deepEqual(JSON.parse(out), { async: true })
    })
  })

  describe('--dry-run', () => {
    it('appears in help text for every command', () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping',
        handler: () => ({}),
      })
      assert.match(cmd.helpInformation(), /--dry-run/)
    })

    it('outputs {"success":true} when --json and skips the handler', async () => {
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping',
        handler: () => { handlerCalled = true; return {} },
      })
      const out = await invokeUnderRoot(cmd, ['--json'], ['--dry-run'])
      assert.equal(handlerCalled, false, 'handler must not be called with --dry-run')
      assert.deepEqual(JSON.parse(out), { success: true })
    })

    it('produces no output and skips the handler in text mode', async () => {
      let handlerCalled = false
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping',
        handler: () => { handlerCalled = true; return {} },
      })
      const out = await invokeUnderRoot(cmd, [], ['--dry-run'])
      assert.equal(handlerCalled, false, 'handler must not be called with --dry-run')
      assert.equal(out, 'dry run: inputs valid, no action performed\n')
    })

    it('outputs {"success":true} and skips handler with valid JSON input via --input-file', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-dryrun-'))
      const filePath = join(tmpDir, 'valid.json')
      writeFileSync(filePath, JSON.stringify({ index: 'logs' }))
      const origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
      try {
        let handlerCalled = false
        const cmd = defineCommand({
          name: 'search',
          description: 'Search',
          input: z.object({ index: z.string() }),
          handler: () => { handlerCalled = true; return {} },
        })
        const out = await invokeUnderRoot(cmd, ['--json'], ['--dry-run', '--input-file', filePath])
        assert.equal(handlerCalled, false, 'handler must not be called with --dry-run')
        assert.deepEqual(JSON.parse(out), { success: true })
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
        rmSync(tmpDir, { recursive: true })
      }
    })

    it('still reports validation error when --dry-run is set with invalid input', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-dryrun-'))
      const filePath = join(tmpDir, 'invalid.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const origIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
      try {
        let handlerCalled = false
        const cmd = defineCommand({
          name: 'search',
          description: 'Search',
          input: z.object({ index: z.string() }),
          handler: () => { handlerCalled = true; return {} },
        })
        const err = await captureErrAsync(cmd, ['--dry-run', '--input-file', filePath])
        assert.match(err, /input validation failed/)
        assert.equal(handlerCalled, false, 'handler must not be called when validation fails')
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
        rmSync(tmpDir, { recursive: true })
      }
    })

    it('throws at definition time when user defines a --dry-run option', () => {
      assert.throws(
        () => defineCommand({
          name: 'test',
          description: 'Test',
          options: [{ long: 'dry-run', description: 'Preview', type: 'boolean' }],
          handler: () => ({}),
        }),
        (e: unknown) => {
          assert.ok(e instanceof Error)
          assert.match(e.message, /--dry-run is reserved/)
          return true
        },
      )
    })

  })
})

describe('text output rendering', () => {
  async function captureOutput(fn: () => Promise<unknown>): Promise<string> {
    let out = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => { out += String(chunk); return true }
    try { await fn() } finally { process.stdout.write = orig }
    return out
  }

  async function invokeText(cmd: OpaqueCommandHandle, cmdArgv: string[] = []): Promise<string> {
    const { Command } = await import('commander')
    const prog = new Command('elastic')
    prog.option('--format <fmt>', 'output format')
    prog.addCommand(cmd)
    prog.exitOverride()
    cmd.exitOverride()
    return captureOutput(() => prog.parseAsync([cmd.name(), ...cmdArgv], { from: 'user' }))
  }

  describe('formatOutput callback', () => {
    it('is called with the handler result in text mode', async () => {
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => ({ ok: true }),
        formatOutput: (result) => { received.push(result); return 'custom\n' },
      })
      await invokeText(cmd)
      assert.equal(received.length, 1)
      assert.deepEqual(received[0], { ok: true })
    })

    it('is called with the parsed result in text mode', async () => {
      const receivedParsed: unknown[] = []
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        options: [{ long: 'verbose', type: 'boolean', description: 'Verbose' }],
        handler: () => ({ ok: true }),
        formatOutput: (result, parsed) => { receivedParsed.push(parsed); return 'ok\n' },
      })
      await invokeText(cmd, ['--verbose'])
      assert.equal(receivedParsed.length, 1)
      const p = receivedParsed[0] as ParsedResult
      assert.equal(p.options['verbose'], true)
    })

    it('output written is the string returned by formatOutput', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => ({ ok: true }),
        formatOutput: () => 'custom output line\n',
      })
      const out = await invokeText(cmd)
      assert.equal(out, 'custom output line\n')
    })

    it('is NOT called when --json is provided', async () => {
      let called = false
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => ({ ok: true }),
        formatOutput: () => { called = true; return 'custom\n' },
      })
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      await captureOutput(() => prog.parseAsync(['--json', cmd.name()], { from: 'user' }))
      assert.equal(called, false, 'formatOutput must not be called in JSON mode')
    })

    it('JSON mode still writes compact JSON even when formatOutput is defined', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => ({ ok: true }),
        formatOutput: () => 'custom\n',
      })
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      const out = await captureOutput(() => prog.parseAsync(['--json', cmd.name()], { from: 'user' }))
      assert.deepEqual(JSON.parse(out), { ok: true })
    })
  })

  describe('auto-rendering (no formatOutput provided)', () => {
    it('renders a string result as plain text', async () => {
      const cmd = defineCommand({
        name: 'echo',
        description: 'Echo',
        handler: () => 'hello world',
      })
      const out = await invokeText(cmd)
      assert.equal(out, 'hello world\n')
    })

    it('renders a number result as its string form', async () => {
      const cmd = defineCommand({
        name: 'count',
        description: 'Count',
        handler: () => 42,
      })
      const out = await invokeText(cmd)
      assert.equal(out, '42\n')
    })

    it('renders an array of primitives one per line', async () => {
      const cmd = defineCommand({
        name: 'list',
        description: 'List',
        handler: () => ['alpha', 'beta', 'gamma'],
      })
      const out = await invokeText(cmd)
      assert.equal(out, 'alpha\nbeta\ngamma\n')
    })

    it('renders an array of flat objects as a table', async () => {
      const cmd = defineCommand({
        name: 'list',
        description: 'List',
        handler: () => [
          { name: 'foo', status: 'ok' },
          { name: 'bar', status: 'error' },
        ],
      })
      const out = await invokeText(cmd)
      assert.match(out, /name/)
      assert.match(out, /status/)
      assert.match(out, /foo/)
      assert.match(out, /bar/)
      assert.match(out, /[─├┤┼]/)
    })

    it('falls back to pretty-printed JSON for a plain object', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => ({ ok: true, count: 3 }),
      })
      const out = await invokeText(cmd)
      assert.equal(out, JSON.stringify({ ok: true, count: 3 }, null, 2) + '\n')
    })

    it('falls back to pretty-printed JSON for nested arrays', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Status',
        handler: () => [{ name: 'foo', tags: ['a', 'b'] }],
      })
      const out = await invokeText(cmd)
      assert.equal(out, JSON.stringify([{ name: 'foo', tags: ['a', 'b'] }], null, 2) + '\n')
    })
  })
})

describe('defineGroup', () => {
  describe('skeleton', () => {
    it('returns a handle with the correct group name', () => {
      const group = defineGroup(
        { name: 'cluster', description: 'Manage clusters' },
      )
      assert.equal(group.name(), 'cluster')
    })

    it('sets the group description from config', () => {
      const group = defineGroup(
        { name: 'index', description: 'Manage indices' },
      )
      assert.equal(group.description(), 'Manage indices')
    })

    it('attaches child command handles via addCommand', () => {
      const health = defineCommand({ name: 'health', description: 'Health check', handler: () => ({}) })
      const stats = defineCommand({ name: 'stats', description: 'Stats', handler: () => ({}) })
      const group = defineGroup(
        { name: 'cluster', description: 'Manage clusters' },
        health,
        stats,
      )
      const childNames = group.commands.map((c) => c.name())
      assert.ok(childNames.includes('health'))
      assert.ok(childNames.includes('stats'))
    })

    it('returns a handle registerable with a parent program', async () => {
      const { Command } = await import('commander')
      const child = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
      const group = defineGroup({ name: 'cluster', description: 'Clusters' }, child)
      const program = new Command('elastic')
      assert.doesNotThrow(() => program.addCommand(group))
      const names = program.commands.map((c) => c.name())
      assert.ok(names.includes('cluster'))
    })

    it('works with zero child commands', () => {
      const group = defineGroup({ name: 'empty', description: 'No children yet' })
      assert.equal(group.name(), 'empty')
      assert.equal(group.commands.length, 0)
    })

    it('each call produces an independent group handle', () => {
      const a = defineGroup({ name: 'group-a', description: 'A' })
      const b = defineGroup({ name: 'group-b', description: 'B' })
      assert.notEqual(a, b)
      assert.equal(a.name(), 'group-a')
      assert.equal(b.name(), 'group-b')
    })
  })

  describe('sub-command dispatch', () => {
    function invoke(handle: OpaqueCommandHandle, argv: string[]): void {
      handle.exitOverride()
      handle.parse(argv, { from: 'user' })
    }

    it('dispatches to the correct child handler when sub-command name matches', () => {
      const healthReceived: ParsedResult[] = []
      const statsReceived: ParsedResult[] = []
      const health = defineCommand({
        name: 'health',
        description: 'Check health',
        handler: (p) => { healthReceived.push(p); return {} },
      })
      const stats = defineCommand({
        name: 'stats',
        description: 'Show stats',
        handler: (p) => { statsReceived.push(p); return {} },
      })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health, stats)
      invoke(cluster, ['health'])
      assert.equal(healthReceived.length, 1)
      assert.equal(statsReceived.length, 0)
    })

    it('dispatches to the second child when its name is used', () => {
      const healthReceived: ParsedResult[] = []
      const statsReceived: ParsedResult[] = []
      const health = defineCommand({
        name: 'health',
        description: 'Check health',
        handler: (p) => { healthReceived.push(p); return {} },
      })
      const stats = defineCommand({
        name: 'stats',
        description: 'Show stats',
        handler: (p) => { statsReceived.push(p); return {} },
      })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health, stats)
      invoke(cluster, ['stats'])
      assert.equal(healthReceived.length, 0)
      assert.equal(statsReceived.length, 1)
    })

    it('passes options through to the dispatched child handler', () => {
      const received: ParsedResult[] = []
      const health = defineCommand({
        name: 'health',
        description: 'Check health',
        options: [{ long: 'verbose', type: 'boolean', description: 'Verbose output' }],
        handler: (p) => { received.push(p); return {} },
      })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      invoke(cluster, ['health', '--verbose'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['verbose'], true)
    })

    it('passes numeric options through to the child handler with correct type', () => {
      const received: ParsedResult[] = []
      const health = defineCommand({
        name: 'health',
        description: 'Check health',
        options: [{ long: 'timeout', type: 'number', description: 'Timeout', defaultValue: 30 }],
        handler: (p) => { received.push(p); return {} },
      })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      invoke(cluster, ['health', '--timeout', '60'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['timeout'], 60)
      assert.equal(typeof received[0].options['timeout'], 'number')
    })

    it('each invocation dispatches independently (no shared state)', () => {
      const received: ParsedResult[] = []
      const health = defineCommand({
        name: 'health',
        description: 'Check health',
        handler: (p) => { received.push(p); return {} },
      })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      invoke(cluster, ['health'])
      invoke(cluster, ['health'])
      assert.equal(received.length, 2)
    })
  })

  describe('group help display', () => {
    function invokeCapture(handle: OpaqueCommandHandle, argv: string[]): string {
      let output = ''
      handle.exitOverride()
      handle.configureOutput({ writeOut: (s) => { output += s } })
      try {
        handle.parse(argv, { from: 'user' })
      } catch {
        // Commander throws under exitOverride when help is displayed
      }
      return output
    }

    it('outputs help listing child command names when invoked without a sub-command', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const stats  = defineCommand({ name: 'stats',  description: 'Show stats',   handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health, stats)
      const output = invokeCapture(cluster, [])
      assert.match(output, /health/)
      assert.match(output, /stats/)
    })

    it('outputs help listing child command descriptions when invoked without a sub-command', () => {
      const health = defineCommand({ name: 'health', description: 'Check cluster health', handler: () => ({}) })
      const stats  = defineCommand({ name: 'stats',  description: 'Show cluster stats',   handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health, stats)
      const output = invokeCapture(cluster, [])
      assert.match(output, /Check cluster health/)
      assert.match(output, /Show cluster stats/)
    })

    it('outputs help when --help flag is passed to the group', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const output = invokeCapture(cluster, ['--help'])
      assert.match(output, /health/)
      assert.match(output, /Cluster commands/)
    })

    it('includes the group description in help output', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Manage Elasticsearch clusters' }, health)
      const output = invokeCapture(cluster, [])
      assert.match(output, /Manage Elasticsearch clusters/)
    })

    it('exits with code 0 (not an error) when group is invoked without a sub-command', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      cluster.exitOverride()
      cluster.configureOutput({ writeOut: () => {} })
      let exitCode: number | undefined
      try {
        cluster.parse([], { from: 'user' })
      } catch (e: unknown) {
        exitCode = (e as { exitCode?: number }).exitCode
      }
      assert.equal(exitCode, 0, 'showing help on empty group invocation should exit 0, not 1')
    })
  })

  describe('leaf command help within a group', () => {
    it('leaf helpInformation() contains the leaf command name', () => {
      const health = defineCommand({
        name: 'health',
        description: 'Check cluster health',
        options: [{ long: 'verbose', type: 'boolean', description: 'Show verbose output' }],
        handler: () => ({}),
      })
      defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const help = health.helpInformation()
      assert.match(help, /health/)
    })

    it('leaf helpInformation() contains the leaf description', () => {
      const health = defineCommand({
        name: 'health',
        description: 'Check cluster health',
        handler: () => ({}),
      })
      defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const help = health.helpInformation()
      assert.match(help, /Check cluster health/)
    })

    it('leaf helpInformation() lists its own options, not the group options', () => {
      const health = defineCommand({
        name: 'health',
        description: 'Check cluster health',
        options: [{ long: 'timeout', type: 'number', description: 'Timeout in seconds', defaultValue: 30 }],
        handler: () => ({}),
      })
      const stats = defineCommand({
        name: 'stats',
        description: 'Show stats',
        options: [{ long: 'format', type: 'string', description: 'Output format' }],
        handler: () => ({}),
      })
      defineGroup({ name: 'cluster', description: 'Cluster commands' }, health, stats)
      const healthHelp = health.helpInformation()
      assert.match(healthHelp, /--timeout/)
      assert.doesNotMatch(healthHelp, /--format/)
      const statsHelp = stats.helpInformation()
      assert.match(statsHelp, /--format/)
      assert.doesNotMatch(statsHelp, /--timeout/)
    })

    it('invoking the leaf handle directly with --help outputs command-specific help', () => {
      const health = defineCommand({
        name: 'health',
        description: 'Check cluster health',
        options: [{ long: 'verbose', type: 'boolean', description: 'Show verbose output' }],
        handler: () => ({}),
      })
      defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      health.exitOverride()
      let out = ''
      health.configureOutput({ writeOut: (s) => { out += s } })
      try { health.parse(['--help'], { from: 'user' }) } catch { /* CommanderError from exitOverride */ }
      assert.match(out, /health/)
      assert.match(out, /Check cluster health/)
      assert.match(out, /--verbose/)
    })
  })

  describe('unknown sub-command error', () => {
    function invokeCapture(handle: OpaqueCommandHandle, argv: string[]): { err: string, code: string } {
      let err = ''
      handle.exitOverride()
      handle.configureOutput({ writeErr: (s) => { err += s } })
      let code = ''
      try {
        handle.parse(argv, { from: 'user' })
      } catch (e: unknown) {
        code = (e as { code?: string }).code ?? ''
      }
      return { err, code }
    }

    it('emits a clear error message when an unknown sub-command is used', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const { err } = invokeCapture(cluster, ['nonexistent'])
      assert.match(err, /nonexistent/)
    })

    it('error message mentions the unrecognised command name', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const { err } = invokeCapture(cluster, ['deploy'])
      assert.match(err, /deploy/)
    })

    it('exits with a non-zero code on unknown sub-command', () => {
      const health = defineCommand({ name: 'health', description: 'Check health', handler: () => ({}) })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      const { code } = invokeCapture(cluster, ['nonexistent'])
      assert.equal(code, 'commander.error')
    })

    it('does not invoke any child handler on unknown sub-command', () => {
      const received: ParsedResult[] = []
      const health = defineCommand({ name: 'health', description: 'Check health', handler: (p) => { received.push(p); return {} } })
      const cluster = defineGroup({ name: 'cluster', description: 'Cluster commands' }, health)
      cluster.exitOverride()
      cluster.configureOutput({ writeErr: () => {} })
      try { cluster.parse(['nonexistent'], { from: 'user' }) } catch { /* CommanderError from exitOverride */ }
      assert.equal(received.length, 0)
    })
  })
  describe('name validation', () => {
    it('throws when group name is empty', () => {
      assert.throws(
        () => defineGroup({ name: '', description: 'Test' }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('throws when group name contains uppercase letters', () => {
      assert.throws(
        () => defineGroup({ name: 'Cluster', description: 'Test' }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })
  })
})

describe('isCommandAllowed', () => {
  it('returns true when policy is undefined (no config)', () => {
    assert.equal(isCommandAllowed('ping', undefined), true)
  })

  it('returns true when policy has no allowed or blocked list', () => {
    assert.equal(isCommandAllowed('ping', {}), true)
  })

  it('allowed list: returns true for an exact match', () => {
    assert.equal(isCommandAllowed('ping', { allowed: ['ping', 'elasticsearch.search'] }), true)
  })

  it('allowed list: returns false when command is not in the list', () => {
    assert.equal(isCommandAllowed('elasticsearch.bulk', { allowed: ['ping', 'elasticsearch.search'] }), false)
  })

  it('allowed list: returns true for a wildcard match', () => {
    assert.equal(isCommandAllowed('elasticsearch.search', { allowed: ['elasticsearch.*'] }), true)
  })

  it('allowed list: returns true for a deeper wildcard match', () => {
    assert.equal(isCommandAllowed('elasticsearch.indices.get', { allowed: ['elasticsearch.*'] }), true)
  })

  it('allowed list: wildcard does not match the prefix itself', () => {
    assert.equal(isCommandAllowed('elasticsearch', { allowed: ['elasticsearch.*'] }), false)
  })

  it('allowed list: returns false when only a different namespace wildcard is present', () => {
    assert.equal(isCommandAllowed('config.set', { allowed: ['elasticsearch.*'] }), false)
  })

  it('blocked list: returns false for an exact match', () => {
    assert.equal(isCommandAllowed('elasticsearch.bulk', { blocked: ['elasticsearch.bulk'] }), false)
  })

  it('blocked list: returns true when command is not in the list', () => {
    assert.equal(isCommandAllowed('ping', { blocked: ['elasticsearch.bulk'] }), true)
  })

  it('blocked list: returns false for a wildcard match', () => {
    assert.equal(isCommandAllowed('config.set', { blocked: ['config.*'] }), false)
  })

  it('blocked list: returns false for a deeper wildcard match', () => {
    assert.equal(isCommandAllowed('config.context.set', { blocked: ['config.*'] }), false)
  })

  it('blocked list: wildcard does not block the prefix itself', () => {
    assert.equal(isCommandAllowed('config', { blocked: ['config.*'] }), true)
  })

  it('blocked list: returns true for commands outside the blocked namespace', () => {
    assert.equal(isCommandAllowed('elasticsearch.search', { blocked: ['config.*'] }), true)
  })

  // --- profile-based filtering ---

  it('profile serverless: allows stack.es.indices.list', () => {
    assert.equal(isCommandAllowed('stack.es.indices.list', { profile: 'serverless' }), true)
  })

  it('profile serverless: allows stack.kb.data-views.list', () => {
    assert.equal(isCommandAllowed('stack.kb.data-views.list', { profile: 'serverless' }), true)
  })

  it('profile serverless: allows cloud.serverless.projects.search.list', () => {
    assert.equal(isCommandAllowed('cloud.serverless.projects.search.list', { profile: 'serverless' }), true)
  })

  it('profile serverless: allows cloud cross-cutting namespaces', () => {
    for (const path of ['cloud.trust.get', 'cloud.auth.list', 'cloud.orgs.list', 'cloud.users.add', 'cloud.billing.get']) {
      assert.equal(isCommandAllowed(path, { profile: 'serverless' }), true, `expected "${path}" to be allowed`)
    }
  })

  it('profile serverless: blocks cloud.hosted commands', () => {
    assert.equal(isCommandAllowed('cloud.hosted.deployments.list', { profile: 'serverless' }), false)
    assert.equal(isCommandAllowed('cloud.hosted.traffic-filters.list', { profile: 'serverless' }), false)
  })

  it('profile serverless: allows version and config commands', () => {
    assert.equal(isCommandAllowed('version', { profile: 'serverless' }), true)
    assert.equal(isCommandAllowed('config.context.list', { profile: 'serverless' }), true)
  })

  it('profile default: behaves the same as serverless', () => {
    assert.equal(isCommandAllowed('cloud.hosted.deployments.list', { profile: 'default' }), false)
    assert.equal(isCommandAllowed('stack.es.search', { profile: 'default' }), true)
  })

  it('profile stack: allows all commands (no restriction)', () => {
    assert.equal(isCommandAllowed('cloud.hosted.deployments.list', { profile: 'stack' }), true)
    assert.equal(isCommandAllowed('cloud.serverless.projects.search.list', { profile: 'stack' }), true)
    assert.equal(isCommandAllowed('anything.at.all', { profile: 'stack' }), true)
  })

  it('profile + blocked: profile allows but blocked further restricts', () => {
    const policy = { profile: 'serverless' as const, blocked: ['stack.es.ml.*'] }
    assert.equal(isCommandAllowed('stack.es.search', policy), true)
    assert.equal(isCommandAllowed('stack.es.ml.get-records', policy), false)
  })

  it('profile + blocked: blocked does not affect commands already excluded by profile', () => {
    const policy = { profile: 'serverless' as const, blocked: ['stack.es.ml.*'] }
    // cloud.hosted is already blocked by the serverless profile; the extra blocked entry doesn't matter
    assert.equal(isCommandAllowed('cloud.hosted.deployments.list', policy), false)
  })
})

describe('command policy enforcement', () => {
  afterEach(() => {
    _testResetConfig()
  })

  it('allowed list: blocks a command not in the list and skips handler', async () => {
    setResolvedConfig({ context: {}, commands: { allowed: ['ping'] } })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      handler: () => { handlerCalled = true; return {} },
    })
    const err = await captureErrAsync(cmd, [])
    assert.match(err, /not allowed/)
    assert.equal(handlerCalled, false)
  })

  it('allowed list: permits a command in the list and runs handler', async () => {
    setResolvedConfig({ context: {}, commands: { allowed: ['ping'] } })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'ping',
      description: 'Ping',
      handler: () => { handlerCalled = true; return {} },
    })
    await invokeAsync(cmd, [])
    assert.equal(handlerCalled, true)
  })

  it('allowed list: wildcard permits matching commands', async () => {
    setResolvedConfig({ context: {}, commands: { allowed: ['elasticsearch.*'] } })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      handler: () => { handlerCalled = true; return {} },
    })
    // mount under a group so the path becomes 'elasticsearch search'
    const { Command } = await import('commander')
    const prog = new Command('elastic')
    const group = new Command('elasticsearch')
    group.addCommand(cmd)
    prog.addCommand(group)
    prog.exitOverride()
    cmd.exitOverride()
    await prog.parseAsync(['elasticsearch', 'search'], { from: 'user' })
    assert.equal(handlerCalled, true)
  })

  it('blocked list: blocks a matching command and skips handler', async () => {
    setResolvedConfig({ context: {}, commands: { blocked: ['search'] } })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      handler: () => { handlerCalled = true; return {} },
    })
    const err = await captureErrAsync(cmd, [])
    assert.match(err, /not allowed/)
    assert.equal(handlerCalled, false)
  })

  it('blocked list: permits a command not in the list', async () => {
    setResolvedConfig({ context: {}, commands: { blocked: ['search'] } })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'ping',
      description: 'Ping',
      handler: () => { handlerCalled = true; return {} },
    })
    await invokeAsync(cmd, [])
    assert.equal(handlerCalled, true)
  })

  it('no policy: all commands are permitted', async () => {
    setResolvedConfig({ context: {} })
    let handlerCalled = false
    const cmd = defineCommand({
      name: 'anything',
      description: 'Anything',
      handler: () => { handlerCalled = true; return {} },
    })
    await invokeAsync(cmd, [])
    assert.equal(handlerCalled, true)
  })

  it('emits structured JSON error to stderr when --json and command is blocked', async () => {
    setResolvedConfig({ context: {}, commands: { allowed: ['ping'] } })
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      handler: () => ({}),
    })
    const { stdout, stderr } = await invokeCapturingStreams(cmd, ['--json'], [])
    assert.equal(stdout, '', 'stdout should be empty for blocked command errors')
    const parsed = JSON.parse(stderr) as Record<string, unknown>
    assert.ok('error' in parsed)
    const err = parsed['error'] as Record<string, unknown>
    assert.equal(err['code'], 'command_blocked')
  })
})

describe('hideBlockedCommands', () => {
  function makeRoot(...cmds: OpaqueCommandHandle[]): OpaqueCommandHandle {
    const prog = new Command('elastic')
    for (const c of cmds) prog.addCommand(c)
    return prog as OpaqueCommandHandle
  }

  it('sets _hidden on a blocked leaf command', () => {
    const cmd = defineCommand({ name: 'search', description: 'Search', handler: () => ({}) })
    const group = defineGroup({ name: 'es', description: 'ES' }, cmd)
    const root = makeRoot(group)
    hideBlockedCommands(root, { blocked: ['es.search'] })
    assert.equal((cmd as unknown as Record<string, boolean>)['_hidden'], true)
  })

  it('does not hide an allowed leaf command', () => {
    const cmd = defineCommand({ name: 'search', description: 'Search', handler: () => ({}) })
    const group = defineGroup({ name: 'es', description: 'ES' }, cmd)
    const root = makeRoot(group)
    hideBlockedCommands(root, { allowed: ['es.search'] })
    assert.equal((cmd as unknown as Record<string, boolean>)['_hidden'], false)
  })

  it('hides a group when all its children are blocked', () => {
    const cmd1 = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
    const cmd2 = defineCommand({ name: 'shards', description: 'Shards', handler: () => ({}) })
    const group = defineGroup({ name: 'cat', description: 'Cat APIs' }, cmd1, cmd2)
    const root = makeRoot(group)
    hideBlockedCommands(root, { blocked: ['cat.health', 'cat.shards'] })
    assert.equal((group as unknown as Record<string, boolean>)['_hidden'], true)
  })

  it('does not hide a group when at least one child is allowed', () => {
    const cmd1 = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
    const cmd2 = defineCommand({ name: 'shards', description: 'Shards', handler: () => ({}) })
    const group = defineGroup({ name: 'cat', description: 'Cat APIs' }, cmd1, cmd2)
    const root = makeRoot(group)
    hideBlockedCommands(root, { blocked: ['cat.health'] })
    assert.equal((group as unknown as Record<string, boolean>)['_hidden'], false)
    assert.equal((cmd1 as unknown as Record<string, boolean>)['_hidden'], true)
    assert.equal((cmd2 as unknown as Record<string, boolean>)['_hidden'], false)
  })

  it('wildcard pattern hides all children under a namespace', () => {
    const cmd1 = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
    const cmd2 = defineCommand({ name: 'shards', description: 'Shards', handler: () => ({}) })
    const group = defineGroup({ name: 'cat', description: 'Cat APIs' }, cmd1, cmd2)
    const root = makeRoot(group)
    hideBlockedCommands(root, { blocked: ['cat.*'] })
    assert.equal((cmd1 as unknown as Record<string, boolean>)['_hidden'], true)
    assert.equal((cmd2 as unknown as Record<string, boolean>)['_hidden'], true)
    assert.equal((group as unknown as Record<string, boolean>)['_hidden'], true)
  })

  it('does nothing when policy is undefined', () => {
    const cmd = defineCommand({ name: 'ping', description: 'Ping', handler: () => ({}) })
    const root = makeRoot(cmd)
    hideBlockedCommands(root, undefined)
    assert.equal((cmd as unknown as Record<string, boolean>)['_hidden'], false)
  })

  it('works with nested groups', () => {
    const leaf = defineCommand({ name: 'get', description: 'Get', handler: () => ({}) })
    const inner = defineGroup({ name: 'indices', description: 'Indices' }, leaf)
    const outer = defineGroup({ name: 'es', description: 'ES' }, inner)
    const root = makeRoot(outer)
    hideBlockedCommands(root, { blocked: ['es.indices.get'] })
    assert.equal((leaf as unknown as Record<string, boolean>)['_hidden'], true)
    assert.equal((inner as unknown as Record<string, boolean>)['_hidden'], true)
  })
})

describe('no Commander API leaks', () => {
  it('factory module exports only public API and test seam at runtime', async () => {
    const factory = await import('../src/factory.ts')
    const exported = Object.keys(factory)
    assert.deepEqual(exported.sort(), ['RawJsonValue', '_testSetStdinReader', 'configureJsonHelp', 'defineCommand', 'defineGroup', 'hideBlockedCommands', 'isCommandAllowed', 'stripTransportMeta'])
  })

  it('defineCommand return value requires no Commander import to use', () => {
    // a command author only needs factory imports -- they never call new Command() themselves
    const handle: OpaqueCommandHandle = defineCommand({
      name: 'ping',
      description: 'Ping the cluster',
      handler: () => ({}),
    })
    // they can inspect the name without knowing it is a Commander Command
    assert.equal(typeof handle.name, 'function')
    assert.equal(handle.name(), 'ping')
  })

  it('defineGroup return value requires no Commander import to use', () => {
    const child: OpaqueCommandHandle = defineCommand({ name: 'health', description: 'Health', handler: () => ({}) })
    const group: OpaqueCommandHandle = defineGroup({ name: 'cluster', description: 'Clusters' }, child)
    assert.equal(typeof group.name, 'function')
    assert.equal(group.name(), 'cluster')
  })

  it('OpaqueCommandHandle is sufficient to type a handle without importing from commander', () => {
    // this test is a compile-time assertion: the annotation below must not require
    // `import type { Command } from 'commander'` -- OpaqueCommandHandle covers it
    function register(handle: OpaqueCommandHandle): string {
      return handle.name()
    }
    const handle = defineCommand({ name: 'deploy', description: 'Deploy', handler: () => ({}) })
    assert.equal(register(handle), 'deploy')
  })
})

describe('defineCommand schema input - CLI arguments', () => {
  let origIsTTY: boolean | undefined
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('string schema field accepts --index and handler receives { index: value }', async () => {
    const schema = z.object({ index: z.string().describe('Index name') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--index', 'my-index'])
    assert.deepEqual(captured, { index: 'my-index' })
  })

  it('number schema field accepts --num-shards and coerces to number', async () => {
    const schema = z.object({ num_shards: z.number().describe('Shard count') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--num-shards', '3'])
    assert.deepEqual(captured, { num_shards: 3 })
  })

  it('boolean schema field accepts --verbose (no value) as true', async () => {
    const schema = z.object({ verbose: z.boolean().default(false).describe('Verbose mode') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'run',
      description: 'Run',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--verbose'])
    assert.deepEqual(captured, { verbose: true })
  })

  it('boolean schema field accepts --verbose false as false', async () => {
    const schema = z.object({ verbose: z.boolean().default(true).describe('Verbose mode') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'run',
      description: 'Run',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--verbose', 'false'])
    assert.deepEqual(captured, { verbose: false })
  })

  it('camelCase schema key refreshInterval accessible as --refresh-interval', async () => {
    const schema = z.object({ refreshInterval: z.number().describe('Refresh ms') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'poll',
      description: 'Poll',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--refresh-interval', '5000'])
    assert.deepEqual(captured, { refreshInterval: 5000 })
  })

  it('snake_case schema key api_key accessible as --api-key', async () => {
    const schema = z.object({ api_key: z.string().describe('API key') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'auth',
      description: 'Auth',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--api-key', 'secret123'])
    assert.deepEqual(captured, { api_key: 'secret123' })
  })

  it('string schema field passes value through as-is without coercion', async () => {
    const schema = z.object({ name: z.string().describe('Name') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'label',
      description: 'Label',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--name', '{"looks":"like json"}'])
    assert.deepEqual(captured, { name: '{"looks":"like json"}' })
  })

  it('schema field default is applied when that CLI arg is not provided', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      size: z.number().default(10).describe('Result size'),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    // provide index but not size; size should receive its schema default
    await invokeAsync(cmd, ['--index', 'my-index'])
    assert.deepEqual(captured, { index: 'my-index', size: 10 })
  })
})

describe('repeated flags', () => {
  let origIsTTY: boolean | undefined
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('string OptionDefinition accumulates repeated values with comma separation', () => {
    const received: ParsedResult[] = []
    const cmd = defineCommand({
      name: 'tag',
      description: 'Tag',
      options: [{ long: 'tag', description: 'Tag value', type: 'string' }],
      handler: (parsed) => { received.push(parsed); return {} },
    })
    cmd.exitOverride()
    cmd.parse(['--tag', 'a', '--tag', 'b'], { from: 'user' })
    assert.equal(received.length, 1)
    assert.equal(received[0].options['tag'], 'a,b')
  })

  it('string OptionDefinition with three repetitions joins all values', () => {
    const received: ParsedResult[] = []
    const cmd = defineCommand({
      name: 'tag',
      description: 'Tag',
      options: [{ long: 'tag', description: 'Tag value', type: 'string' }],
      handler: (parsed) => { received.push(parsed); return {} },
    })
    cmd.exitOverride()
    cmd.parse(['--tag', 'a', '--tag', 'b', '--tag', 'c'], { from: 'user' })
    assert.equal(received.length, 1)
    assert.equal(received[0].options['tag'], 'a,b,c')
  })

  it('single string occurrence is unchanged (regression guard)', () => {
    const received: ParsedResult[] = []
    const cmd = defineCommand({
      name: 'tag',
      description: 'Tag',
      options: [{ long: 'tag', description: 'Tag value', type: 'string' }],
      handler: (parsed) => { received.push(parsed); return {} },
    })
    cmd.exitOverride()
    cmd.parse(['--tag', 'only-one'], { from: 'user' })
    assert.equal(received.length, 1)
    assert.equal(received[0].options['tag'], 'only-one')
  })

  it('string OptionDefinition with defaultValue does not accumulate default into CLI value', () => {
    const received: ParsedResult[] = []
    const cmd = defineCommand({
      name: 'tag',
      description: 'Tag',
      options: [{ long: 'tag', description: 'Tag value', type: 'string', defaultValue: 'default-val' }],
      handler: (parsed) => { received.push(parsed); return {} },
    })
    cmd.exitOverride()
    cmd.parse(['--tag', 'cli-val'], { from: 'user' })
    assert.equal(received.length, 1)
    assert.equal(received[0].options['tag'], 'cli-val')
  })

  it('number OptionDefinition rejects repeated values', () => {
    const cmd = defineCommand({
      name: 'run',
      description: 'Run',
      options: [{ long: 'count', description: 'Count', type: 'number' }],
      handler: () => ({}),
    })
    let err = ''
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: (s) => { err += s } })
    try { cmd.parse(['--count', '5', '--count', '10'], { from: 'user' }) } catch { /* CommanderError */ }
    assert.match(err, /cannot be specified more than once/)
  })

  it('boolean OptionDefinition is idempotent when repeated', () => {
    const received: ParsedResult[] = []
    const cmd = defineCommand({
      name: 'run',
      description: 'Run',
      options: [{ long: 'verbose', description: 'Verbose', type: 'boolean' }],
      handler: (parsed) => { received.push(parsed); return {} },
    })
    cmd.exitOverride()
    cmd.parse(['--verbose', '--verbose'], { from: 'user' })
    assert.equal(received.length, 1)
    assert.equal(received[0].options['verbose'], true)
  })

  it('schema-derived string accumulates repeated values', async () => {
    const schema = z.object({ index: z.string().describe('Index name') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--index', 'idx-a', '--index', 'idx-b'])
    assert.deepEqual(captured, { index: 'idx-a,idx-b' })
  })

  it('schema-derived number rejects repeated values', async () => {
    const schema = z.object({ size: z.number().describe('Result size') })
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: () => ({}),
    })
    const err = await captureErrAsync(cmd, ['--size', '5', '--size', '10'])
    assert.match(err, /cannot be specified more than once/)
  })

  it('schema-derived enum rejects repeated values', async () => {
    const schema = z.object({ mode: z.enum(['fast', 'slow']).describe('Mode') })
    const cmd = defineCommand({
      name: 'run',
      description: 'Run',
      input: schema,
      handler: () => ({}),
    })
    const err = await captureErrAsync(cmd, ['--mode', 'fast', '--mode', 'slow'])
    assert.match(err, /cannot be specified more than once/)
  })

  it('schema-derived string with Zod default does not accumulate default into CLI value', async () => {
    const schema = z.object({ index: z.string().default('default-idx').describe('Index name') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--index', 'my-idx'])
    assert.deepEqual(captured, { index: 'my-idx' })
  })

  it('schema-derived string with Zod default accumulates repeated CLI values', async () => {
    const schema = z.object({ index: z.string().default('default-idx').describe('Index name') })
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--index', 'idx-a', '--index', 'idx-b'])
    assert.deepEqual(captured, { index: 'idx-a,idx-b' })
  })

  it('schema-derived object rejects repeated values', async () => {
    const schema = z.object({ mappings: z.object({}).passthrough().describe('Mappings') })
    const cmd = defineCommand({
      name: 'create',
      description: 'Create',
      input: schema,
      handler: () => ({}),
    })
    const err = await captureErrAsync(cmd, ['--mappings', '{}', '--mappings', '{"a":1}'])
    assert.match(err, /cannot be specified more than once/)
  })

  it('schema-derived union(string, array) body arg splits CSV into an array (#167)', async () => {
    const schema = z.object({
      fields: z.union([z.string(), z.array(z.string())]).optional().meta({ found_in: 'body' }),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--fields', 'title,status'])
    assert.deepEqual(captured, { fields: ['title', 'status'] })
  })

  it('single-value union(string, array) body arg stays a string', async () => {
    const schema = z.object({
      fields: z.union([z.string(), z.array(z.string())]).optional().meta({ found_in: 'body' }),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--fields', 'title'])
    assert.deepEqual(captured, { fields: 'title' })
  })

  it('repeated --fields flags accumulate and then split into an array', async () => {
    const schema = z.object({
      fields: z.union([z.string(), z.array(z.string())]).optional().meta({ found_in: 'body' }),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--fields', 'title', '--fields', 'status'])
    assert.deepEqual(captured, { fields: ['title', 'status'] })
  })

  it('union(string, array) query arg keeps CSV as a string (ES splits server-side)', async () => {
    const schema = z.object({
      filters: z.union([z.string(), z.array(z.string())]).optional().meta({ found_in: 'query' }),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--filters', 'a,b'])
    assert.deepEqual(captured, { filters: 'a,b' })
  })

  it('--help mentions --input-file fallback for body-routed union(string, array) args', () => {
    const schema = z.object({
      fields: z.union([z.string(), z.array(z.string())]).optional().describe('Fields list').meta({ found_in: 'body' }),
    })
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: () => ({}),
    })
    const help = cmd.helpInformation()
    assert.match(help, /--input-file with a JSON array/)
  })

  it('--help does not mention the CSV fallback for query-routed union args', () => {
    const schema = z.object({
      filters: z.union([z.string(), z.array(z.string())]).optional().describe('Filters').meta({ found_in: 'query' }),
    })
    const cmd = defineCommand({
      name: 'field-caps',
      description: 'Field caps',
      input: schema,
      handler: () => ({}),
    })
    const help = cmd.helpInformation()
    assert.doesNotMatch(help, /--input-file with a JSON array/)
  })

  describe('Sort body args (id="Sort") -- field:direction parsing (#330)', () => {
    // Mirrors the ES `Sort` schema shape: union(union(Field, SortOptions), array(...)) tagged with id="Sort".
    const SortOptions = z.object({ _score: z.string().optional() }).meta({ id: 'SortOptions' })
    const SortCombinations = z.union([z.string(), SortOptions]).meta({ id: 'SortCombinations' })
    const Sort = z.union([SortCombinations, z.array(SortCombinations)]).meta({ id: 'Sort' })

    function makeCmd (captured: { value?: unknown }): OpaqueCommandHandle {
      const schema = z.object({
        sort: z.lazy(() => Sort).describe('A comma-separated list of <field>:<direction> pairs.').optional().meta({ found_in: 'body' }),
      })
      return defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { captured.value = parsed.input; return {} },
      })
    }

    it('single field:direction is sent as [{field: direction}]', async () => {
      const captured: { value?: unknown } = {}
      await invokeAsync(makeCmd(captured), ['--sort', 'views:desc'])
      assert.deepEqual(captured.value, { sort: [{ views: 'desc' }] })
    })

    it('bare field name with no colon is preserved as a string', async () => {
      const captured: { value?: unknown } = {}
      await invokeAsync(makeCmd(captured), ['--sort', 'views'])
      assert.deepEqual(captured.value, { sort: 'views' })
    })

    it('multiple field:direction pairs become an array of objects', async () => {
      const captured: { value?: unknown } = {}
      await invokeAsync(makeCmd(captured), ['--sort', 'views:desc,timestamp:asc'])
      assert.deepEqual(captured.value, { sort: [{ views: 'desc' }, { timestamp: 'asc' }] })
    })

    it('mixed bare and pair entries are preserved per entry', async () => {
      const captured: { value?: unknown } = {}
      await invokeAsync(makeCmd(captured), ['--sort', 'views,timestamp:desc'])
      assert.deepEqual(captured.value, { sort: ['views', { timestamp: 'desc' }] })
    })

    it('dotted field names are kept whole', async () => {
      const captured: { value?: unknown } = {}
      await invokeAsync(makeCmd(captured), ['--sort', 'user.name:asc'])
      assert.deepEqual(captured.value, { sort: [{ 'user.name': 'asc' }] })
    })

    it('non-Sort string fields are unaffected by the colon transform', async () => {
      let captured: unknown
      const schema = z.object({
        q: z.string().optional().describe('Query').meta({ found_in: 'query' }),
      })
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { captured = parsed.input; return {} },
      })
      await invokeAsync(cmd, ['--q', 'k:v'])
      assert.deepEqual(captured, { q: 'k:v' })
    })
  })
})

describe('defineCommand schema input - passthrough validation', () => {
  let tmpDir: string
  let origIsTTY: boolean | undefined

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
  })
  after(() => {
    rmSync(tmpDir, { recursive: true })
  })
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('valid JSON via --input-file is accepted when schema has registered CLI args', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().default(1).describe('Shards'),
    })
    const filePath = join(tmpDir, 'valid.json')
    writeFileSync(filePath, JSON.stringify({ index: 'logs', num_shards: 3 }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath])
    assert.deepEqual(captured, { index: 'logs', num_shards: 3 })
  })

  it('JSON via --input-file with an unknown key passes it through', async () => {
    const schema = z.object({ index: z.string().describe('Index') })
    const filePath = join(tmpDir, 'unknown-key.json')
    writeFileSync(filePath, JSON.stringify({ index: 'foo', bogus: 1 }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath])
    const input = captured as Record<string, unknown>
    assert.equal(input.index, 'foo')
    assert.equal(input.bogus, 1)
  })

  it('JSON via stdin with an unknown key passes it through', async () => {
    const schema = z.object({ index: z.string().describe('Index') })
    const restore = _testSetStdinReader(() => JSON.stringify({ index: 'foo', bogus: 1 }))
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true })
    try {
      let captured: unknown
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { captured = parsed.input; return {} },
      })
      await invokeAsync(cmd, [])
      const input = captured as Record<string, unknown>
      assert.equal(input.index, 'foo')
      assert.equal(input.bogus, 1)
    } finally {
      restore()
    }
  })
})
describe('defineCommand schema input - JSON + CLI merge', () => {
  let tmpDir: string
  let origIsTTY: boolean | undefined

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'elastic-cli-test-'))
  })
  after(() => {
    rmSync(tmpDir, { recursive: true })
  })
  beforeEach(() => {
    origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true, writable: true })
  })

  it('JSON + CLI --num-shards 5 merges to CLI value winning', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().describe('Shards'),
    })
    const filePath = join(tmpDir, 't027.json')
    writeFileSync(filePath, JSON.stringify({ index: 'logs', num_shards: 1 }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath, '--num-shards', '5'])
    assert.deepEqual(captured, { index: 'logs', num_shards: 5 })
  })

  it('CLI adds a key absent from JSON', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().describe('Shards'),
    })
    const filePath = join(tmpDir, 't028.json')
    writeFileSync(filePath, JSON.stringify({ index: 'logs' }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath, '--num-shards', '2'])
    assert.deepEqual(captured, { index: 'logs', num_shards: 2 })
  })

  it('JSON only passes through as-is', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().default(1).describe('Shards'),
    })
    const filePath = join(tmpDir, 't029.json')
    writeFileSync(filePath, JSON.stringify({ index: 'logs', num_shards: 3 }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath])
    assert.deepEqual(captured, { index: 'logs', num_shards: 3 })
  })

  it('CLI only passes through as-is', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().default(1).describe('Shards'),
    })
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--index', 'my-index', '--num-shards', '4'])
    assert.deepEqual(captured, { index: 'my-index', num_shards: 4 })
  })

  it('unknown key from JSON is passed through after merging with CLI args', async () => {
    const schema = z.object({
      index: z.string().describe('Index'),
      num_shards: z.number().default(1).describe('Shards'),
    })
    const filePath = join(tmpDir, 't031.json')
    writeFileSync(filePath, JSON.stringify({ index: 'logs', unknown_key: 'extra' }))
    let captured: unknown
    const cmd = defineCommand({
      name: 'create',
      description: 'Create index',
      input: schema,
      handler: (parsed) => { captured = parsed.input; return {} },
    })
    await invokeAsync(cmd, ['--input-file', filePath, '--num-shards', '3'])
    const input = captured as Record<string, unknown>
    assert.equal(input.index, 'logs')
    assert.equal(input.num_shards, 3)
    assert.equal(input.unknown_key, 'extra')
  })
})
describe('forward-compatibility and extensibility', () => {
  it('CommandConfig with only required fields compiles and works', () => {
    // verifies that a minimal config (no optional fields) is accepted and functional
    const cmd = defineCommand({
      name: 'ping',
      description: 'Ping the cluster',
      handler: () => ({}),
    })
    assert.equal(cmd.name(), 'ping')
    assert.equal(cmd.description(), 'Ping the cluster')
  })

  it('CommandConfig accepts new optional fields without breaking existing definitions', () => {
    // simulates a future iteration adding an optional field to CommandConfig;
    // the spread below would pick up any new optional fields without touching existing code
    const base = {
      name: 'health',
      description: 'Check health',
      handler: () => ({}),
    }
    // spread ensures no TypeScript error when additional optional properties are present
    const extended = { ...base, options: [] }
    const cmd = defineCommand(extended)
    assert.equal(cmd.name(), 'health')
  })

  it('OptionDefinition accepts only required fields (forward-compatible)', () => {
    const minimal: import('../src/factory.ts').OptionDefinition = {
      long: 'verbose',
      description: 'Enable verbose output',
    }
    assert.equal(minimal.long, 'verbose')
    assert.equal(minimal.type, undefined)
    assert.equal(minimal.required, undefined)
    assert.equal(minimal.defaultValue, undefined)
  })

  it('GroupConfig with only required fields compiles and works', () => {
    const group = defineGroup({ name: 'cluster', description: 'Manage clusters' })
    assert.equal(group.name(), 'cluster')
  })

  it('factory functions are the only surface a command author needs to import', () => {
    // all types needed to define a command are re-exportable from factory.ts
    type Config = import('../src/factory.ts').CommandConfig
    type GConfig = import('../src/factory.ts').GroupConfig
    type OptDef = import('../src/factory.ts').OptionDefinition
    type Result = import('../src/factory.ts').ParsedResult
    type Handle = import('../src/factory.ts').OpaqueCommandHandle
    // if any of these type imports fail to compile, the factory's public surface is broken
    const _typeCheck: [Config, GConfig, OptDef, Result, Handle] | null = null
    assert.equal(_typeCheck, null)
  })
})

describe('JSON schema in help output', () => {
  describe('human-readable help text', () => {
    it('does NOT include Input Schema section when command has an input schema', () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string() }),
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.doesNotMatch(help, /Input Schema:/)
    })

    it('does NOT include JSON schema properties in human-readable help text', () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string(), size: z.number() }),
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.doesNotMatch(help, /"index"/)
      assert.doesNotMatch(help, /"size"/)
    })

    it('does NOT include Input Schema section when command has no input schema', () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping the cluster',
        handler: () => ({}),
      })
      const help = cmd.helpInformation()
      assert.doesNotMatch(help, /Input Schema:/)
    })
  })

  describe('--json help output', () => {
    async function captureJsonHelp(cmd: OpaqueCommandHandle): Promise<{ out: string, parsed: unknown }> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--json', 'output as JSON')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      let out = ''
      cmd.configureOutput({ writeOut: (s) => { out += s } })
      try {
        await prog.parseAsync(['--json', cmd.name(), '--help'], { from: 'user' })
      } catch { /* CommanderError from exitOverride on --help */ }
      let parsed: unknown = null
      try { parsed = JSON.parse(out) } catch { /* not JSON - test will fail on assertion */ }
      return { out, parsed }
    }

    it('emits the raw JSON Schema object when --json and --help are used together', async () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string() }),
        handler: () => ({}),
      })
      const { parsed } = await captureJsonHelp(cmd)
      assert.ok(parsed !== null, 'output was not valid JSON')
    })

    it('JSON output is the raw schema with type and properties at the top level', async () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string(), size: z.number() }),
        handler: () => ({}),
      })
      const { parsed } = await captureJsonHelp(cmd)
      const schema = parsed as Record<string, unknown>
      assert.equal(schema['type'], 'object')
      const props = schema['properties'] as Record<string, unknown>
      assert.ok('index' in props, 'expected index property')
      assert.ok('size' in props, 'expected size property')
    })

    it('JSON output does not wrap the schema in an envelope with name or options', async () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string() }),
        handler: () => ({}),
      })
      const { parsed } = await captureJsonHelp(cmd)
      const schema = parsed as Record<string, unknown>
      assert.ok(!('name' in schema), 'expected no name key at top level')
      assert.ok(!('options' in schema), 'expected no options key at top level')
      assert.ok(!('input_schema' in schema), 'expected no input_schema wrapper key')
    })

    it('prints nothing for commands with no input schema, no options, and no positional arg', async () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping the cluster',
        handler: () => ({}),
      })
      const { out } = await captureJsonHelp(cmd)
      assert.equal(out, '', 'expected empty output for parameter-less command')
    })

    it('required fields appear in the JSON schema required array', async () => {
      const cmd = defineCommand({
        name: 'search',
        description: 'Search an index',
        input: z.object({ index: z.string() }),
        handler: () => ({}),
      })
      const { parsed } = await captureJsonHelp(cmd)
      const schema = parsed as Record<string, unknown>
      const required = schema['required'] as string[]
      assert.ok(Array.isArray(required), 'expected required array')
      assert.ok(required.includes('index'), 'expected index in required')
    })

    it('nested object schema produces correct nested JSON schema output', async () => {
      const cmd = defineCommand({
        name: 'create',
        description: 'Create a resource',
        input: z.object({ address: z.object({ zipCode: z.string() }) }),
        handler: () => ({}),
      })
      const { parsed } = await captureJsonHelp(cmd)
      const schema = parsed as Record<string, unknown>
      const props = schema['properties'] as Record<string, Record<string, unknown>>
      assert.equal(props['address']!['type'], 'object')
      const nestedProps = props['address']!['properties'] as Record<string, unknown>
      assert.ok('zipCode' in nestedProps)
    })

    it('JSON output is not truncated when the schema exceeds the 64 KB pipe buffer', async () => {
      // Build a schema large enough to exceed the 64 KB pipe buffer (~65 536 bytes).
      // Each field contributes ~30 bytes to the serialised JSON schema, so 3000
      // fields comfortably exceeds the threshold.
      const fields: Record<string, z.ZodType> = {}
      for (let i = 0; i < 3000; i++) fields[`field_${i}`] = z.string().optional()
      const cmd = defineCommand({
        name: 'bulk',
        description: 'Large schema command',
        input: z.object(fields),
        handler: () => ({}),
      })
      const { out } = await captureJsonHelp(cmd)
      assert.ok(out.length > 65536, `expected output > 64 KB, got ${out.length} bytes`)
      assert.doesNotThrow(() => JSON.parse(out), 'output must be valid JSON')
    })
  })
})

describe('JSON schema in help output -- transport meta stripping', () => {
  async function captureJsonHelp(cmd: OpaqueCommandHandle): Promise<Record<string, unknown>> {
    const { Command } = await import('commander')
    const prog = new Command('elastic')
    prog.option('--json', 'output as JSON')
    prog.addCommand(cmd as unknown as InstanceType<typeof Command>)
    prog.exitOverride()
    ;(cmd as unknown as InstanceType<typeof Command>).exitOverride()
    let out = ''
    ;(cmd as unknown as InstanceType<typeof Command>).configureOutput({ writeOut: (s: string) => { out += s } })
    try {
      await prog.parseAsync(['--json', cmd.name(), '--help'], { from: 'user' })
    } catch { /* exitOverride on --help */ }
    return JSON.parse(out) as Record<string, unknown>
  }

  it('found_in is not present in JSON schema output for a schema with found_in metadata', async () => {
    const cmd = defineCommand({
      name: 'create',
      description: 'Create an index',
      input: z.looseObject({
        index: z.string().describe('Target index').meta({ found_in: 'path' }),
        master_timeout: z.string().optional().describe('Timeout').meta({ found_in: 'query' }),
        settings: z.record(z.string(), z.unknown()).optional().describe('Settings').meta({ found_in: 'body' }),
      }),
      handler: () => ({}),
    })
    const schema = await captureJsonHelp(cmd)
    const props = schema['properties'] as Record<string, Record<string, unknown>>
    assert.ok(!('found_in' in (props['index'] ?? {})), 'found_in must not appear in index property')
    assert.ok(!('found_in' in (props['master_timeout'] ?? {})), 'found_in must not appear in master_timeout property')
    assert.ok(!('found_in' in (props['settings'] ?? {})), 'found_in must not appear in settings property')
  })

  it('found_in is stripped from nested schema objects too', async () => {
    const cmd = defineCommand({
      name: 'search',
      description: 'Search',
      input: z.looseObject({
        index: z.string().meta({ found_in: 'path' }),
      }),
      handler: () => ({}),
    })
    const schemaStr = JSON.stringify(await captureJsonHelp(cmd))
    assert.ok(!schemaStr.includes('found_in'), `found_in must not appear anywhere in schema output; got: ${schemaStr}`)
  })

  it('stripping found_in does not remove other metadata (description, type, etc.)', async () => {
    const cmd = defineCommand({
      name: 'create',
      description: 'Create',
      input: z.looseObject({
        index: z.string().describe('Target index').meta({ found_in: 'path' }),
      }),
      handler: () => ({}),
    })
    const schema = await captureJsonHelp(cmd)
    const props = schema['properties'] as Record<string, Record<string, unknown>>
    assert.equal(props['index']?.['description'], 'Target index', 'description must be preserved')
    assert.equal(props['index']?.['type'], 'string', 'type must be preserved')
  })
})

/** invokes a command handle via parseAsync; surfaces CommanderError via exitOverride */
async function invokeAsync(handle: OpaqueCommandHandle, argv: string[]): Promise<void> {
  handle.exitOverride()
  await handle.parseAsync(argv, { from: 'user' })
}

/** invokes a command handle and captures its stderr output */
async function captureErrAsync(handle: OpaqueCommandHandle, argv: string[]): Promise<string> {
  let err = ''
  handle.exitOverride()
  handle.configureOutput({ writeErr: (s) => { err += s } })
  try { await handle.parseAsync(argv, { from: 'user' }) } catch { /* CommanderError from exitOverride */ }
  return err
}

/** captures everything written to process.stdout during fn(), even if fn throws */
async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  let out = ''
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => { out += String(chunk); return true }
  try { await fn() } catch { /* swallow — caller inspects captured output */ } finally { process.stdout.write = orig }
  return out
}

/** mounts a command under a root program with --json and captures stdout */
async function invokeUnderRoot(cmd: OpaqueCommandHandle, rootArgv: string[], cmdArgv: string[]): Promise<string> {
  const { Command } = await import('commander')
  const prog = new Command('elastic')
  prog.option('--json', 'output as JSON')
  prog.addCommand(cmd)
  prog.exitOverride()
  cmd.exitOverride()
  return captureStdout(() => prog.parseAsync([...rootArgv, cmd.name(), ...cmdArgv], { from: 'user' }))
}

/** captures stdout, stderr, and exitCode separately */
async function captureStreams(fn: () => Promise<void>): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  let stdout = ''
  let stderr = ''
  let exitCode: number
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const origExitCode = process.exitCode
  process.exitCode = 0
  process.stdout.write = (chunk: unknown) => { stdout += String(chunk); return true }
  process.stderr.write = (chunk: unknown) => { stderr += String(chunk); return true }
  try {
    await fn()
  } catch {
    /* swallow -- caller inspects captured output */
  } finally {
    exitCode = process.exitCode ?? 0
    process.stdout.write = origOut
    process.stderr.write = origErr
    process.exitCode = origExitCode as typeof process.exitCode
  }
  return { stdout, stderr, exitCode }
}

/** mounts a command under a root program and captures stdout, stderr, exitCode */
async function invokeCapturingStreams(
  cmd: OpaqueCommandHandle,
  rootArgv: string[],
  cmdArgv: string[],
): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  const { Command } = await import('commander')
  const prog = new Command('elastic')
  prog.option('--json', 'output as JSON')
  prog.addCommand(cmd)
  prog.exitOverride()
  cmd.exitOverride()
  return captureStreams(() => prog.parseAsync([...rootArgv, cmd.name(), ...cmdArgv], { from: 'user' }))
}

describe('error result detection', () => {
  it('error result in JSON mode goes to stderr with non-zero exit', async () => {
    const cmd = defineCommand({
      name: 'fail',
      description: 'Fail',
      handler: () => ({ error: { code: 'transport_error', message: 'connection refused' } }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, ['--json'], [])
    assert.equal(stdout, '', 'stdout should be empty for error results')
    const parsed = JSON.parse(stderr) as Record<string, unknown>
    const err = parsed['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['message'], 'connection refused')
    assert.equal(exitCode, 1)
  })

  it('error result in text mode renders human-readable message to stderr', async () => {
    const cmd = defineCommand({
      name: 'fail',
      description: 'Fail',
      handler: () => ({ error: { code: 'missing_config', message: 'No ES configured' } }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, [], [])
    assert.equal(stdout, '', 'stdout should be empty for error results')
    assert.equal(stderr, 'Error: No ES configured\n')
    assert.equal(exitCode, 1)
  })

  it('text mode extracts type and reason from transport_error with ES body', async () => {
    const cmd = defineCommand({
      name: 'fail',
      description: 'Fail',
      handler: () => ({
        error: {
          code: 'transport_error',
          status_code: 404,
          body: { error: { type: 'index_not_found_exception', reason: 'no such index [foo]' } },
        },
      }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, [], [])
    assert.equal(stdout, '')
    assert.equal(stderr, 'Error: index_not_found_exception: no such index [foo]\n')
    assert.equal(exitCode, 1)
  })

  it('successful result in JSON mode goes to stdout with exit 0', async () => {
    const cmd = defineCommand({
      name: 'ok',
      description: 'OK',
      handler: () => ({ status: 'green' }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, ['--json'], [])
    assert.deepEqual(JSON.parse(stdout), { status: 'green' })
    assert.equal(stderr, '')
    assert.equal(exitCode, 0)
  })

  it('result with non-contract error shape is not treated as error', async () => {
    const cmd = defineCommand({
      name: 'ok',
      description: 'OK',
      handler: () => ({ error: 'just a string' }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, ['--json'], [])
    assert.deepEqual(JSON.parse(stdout), { error: 'just a string' })
    assert.equal(stderr, '')
    assert.equal(exitCode, 0)
  })

  it('error result with status_code and body is written to stderr', async () => {
    const cmd = defineCommand({
      name: 'fail',
      description: 'Fail',
      handler: () => ({
        error: {
          code: 'transport_error',
          status_code: 404,
          body: { error: { type: 'index_not_found_exception' } },
        },
      }),
    })
    const { stdout, stderr, exitCode } = await invokeCapturingStreams(cmd, ['--json'], [])
    assert.equal(stdout, '')
    const parsed = JSON.parse(stderr) as Record<string, unknown>
    const err = parsed['error'] as Record<string, unknown>
    assert.equal(err['code'], 'transport_error')
    assert.equal(err['status_code'], 404)
    assert.equal(exitCode, 1)
  })

  it('formatOutput is not called for error results', async () => {
    let formatCalled = false
    const cmd = defineCommand({
      name: 'fail',
      description: 'Fail',
      handler: () => ({ error: { code: 'cloud_api_error', message: 'bad' } }),
      formatOutput: () => { formatCalled = true; return 'custom\n' },
    })
    await invokeCapturingStreams(cmd, [], [])
    assert.equal(formatCalled, false)
  })
})

describe('configureJsonHelp', () => {
  async function captureHelp (prog: InstanceType<typeof Command>, argv: string[]): Promise<string> {
    prog.exitOverride()
    let out = ''
    prog.configureOutput({ writeOut: (s) => { out += s } })
    try {
      await prog.parseAsync(argv, { from: 'user' })
    } catch { /* exitOverride throws on --help */ }
    return out
  }

  it('returns JSON when --json is set on the root program', async () => {
    const prog = new Command('elastic')
    prog.description('CLI')
    prog.option('--json', 'output as JSON')
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json'])
    const parsed = JSON.parse(out) as Record<string, unknown>
    assert.equal(parsed['name'], 'elastic')
    assert.equal(parsed['description'], 'CLI')
  })

  it('returns text help when --json is absent', async () => {
    const prog = new Command('elastic')
    prog.description('CLI')
    prog.option('--json', 'output as JSON')
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help'])
    assert.match(out, /^Usage: elastic/m)
  })

  it('serialises options including mandatory and primitive defaults', async () => {
    const prog = new Command('elastic')
    prog.description('CLI')
    prog.option('--json', 'output as JSON')
    prog.option('--retries <n>', 'retry count', '3')
    prog.requiredOption('--token <value>', 'auth token')
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json', '--token', 'x'])
    const parsed = JSON.parse(out) as { options: Array<Record<string, unknown>> }
    const retries = parsed.options.find((o) => (o['flags'] as string).includes('--retries'))
    assert.ok(retries != null)
    assert.equal(retries['defaultValue'], '3')
    const token = parsed.options.find((o) => (o['flags'] as string).includes('--token'))
    assert.ok(token != null)
    assert.equal(token['mandatory'], true)
  })

  it('omits hidden options and hidden commands from JSON help', async () => {
    const prog = new Command('elastic')
    prog.description('CLI')
    prog.option('--json', 'output as JSON')
    prog.option('--secret <s>', 'hidden')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secretOpt = prog.options.find((o) => o.long === '--secret') as any
    secretOpt.hidden = true
    const visible = defineCommand({ name: 'ping', description: 'Ping', handler: () => ({}) })
    const hidden = defineCommand({ name: 'internal', description: 'Internal', handler: () => ({}) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(hidden as unknown as any)._hidden = true
    prog.addCommand(visible)
    prog.addCommand(hidden)
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json'])
    const parsed = JSON.parse(out) as {
      options: Array<{ flags: string }>
      commands: Array<{ name: string }>
    }
    assert.ok(!parsed.options.some((o) => o.flags.includes('--secret')), 'hidden option leaked')
    assert.ok(!parsed.commands.some((c) => c.name === 'internal'), 'hidden command leaked')
    assert.ok(parsed.commands.some((c) => c.name === 'ping'), 'expected visible command')
  })

  it('includes aliases on sub-commands that have them', async () => {
    const prog = new Command('elastic')
    prog.description('CLI')
    prog.option('--json', 'output as JSON')
    const child = defineGroup({ name: 'stack', description: 'Stack' })
    child.alias('es')
    prog.addCommand(child)
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json'])
    const parsed = JSON.parse(out) as { commands: Array<{ name: string; aliases?: string[] }> }
    const stack = parsed.commands.find((c) => c.name === 'stack')
    assert.deepEqual(stack?.aliases, ['es'])
  })

  it('preserves numeric and boolean defaults from Commander options', async () => {
    const prog = new Command('elastic')
    prog.option('--json', 'output as JSON')
    prog.option('--count <n>', 'count', 5)
    prog.option('--enabled', 'enabled flag', false)
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json'])
    const parsed = JSON.parse(out) as { options: Array<Record<string, unknown>> }
    const count = parsed.options.find((o) => (o['flags'] as string).includes('--count'))
    assert.equal(count?.['defaultValue'], 5)
    const enabled = parsed.options.find((o) => (o['flags'] as string).includes('--enabled'))
    assert.equal(enabled?.['defaultValue'], false)
  })

  it('omits the auto-added `help` sub-command from JSON help', async () => {
    const prog = new Command('elastic')
    prog.option('--json', 'output as JSON')
    const child = defineCommand({ name: 'ping', description: 'Ping', handler: () => ({}) })
    prog.addCommand(child)
    // Commander adds a synthetic `help` command on commands with sub-commands;
    // force-add one to mirror that.
    prog.addCommand(new Command('help'))
    configureJsonHelp(prog)
    const out = await captureHelp(prog, ['--help', '--json'])
    const parsed = JSON.parse(out) as { commands: Array<{ name: string }> }
    assert.ok(!parsed.commands.some((c) => c.name === 'help'), 'auto-help command leaked')
    assert.ok(parsed.commands.some((c) => c.name === 'ping'))
  })

  it('groups respect --json from the root via parent walk', async () => {
    const prog = new Command('elastic')
    prog.option('--json', 'output as JSON')
    const group = defineGroup({ name: 'sanitize', description: 'Sanitize' })
    prog.addCommand(group)
    prog.exitOverride()
    group.exitOverride()
    let out = ''
    group.configureOutput({ writeOut: (s) => { out += s } })
    try {
      await prog.parseAsync(['--json', 'sanitize', '--help'], { from: 'user' })
    } catch { /* exitOverride on --help */ }
    const parsed = JSON.parse(out) as { name: string }
    assert.equal(parsed.name, 'sanitize')
  })
})
