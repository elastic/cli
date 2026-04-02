/**
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
import { defineCommand, defineGroup, _testSetStdinReader } from '../src/factory.ts'
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
        options: [{ long: 'dry-run', description: 'Preview', type: 'boolean' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      invoke(cmd, ['--dry-run'])
      assert.equal(received.length, 1)
      assert.equal(received[0].options['dry-run'], true)
      // no unexpected keys from Commander internals
      assert.deepEqual(Object.keys(received[0].options), ['dry-run'])
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
    it('registers --file <path> option when input is a Zod schema', () => {
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const helpText = cmd.helpInformation()
      assert.ok(helpText.includes('--file'), `expected --file in help text:\n${helpText}`)
    })

    it('does NOT register --file option when input is omitted', () => {
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        handler: () => ({}),
      })
      const helpText = cmd.helpInformation()
      assert.ok(!helpText.includes('--file'), `expected no --file in help text:\n${helpText}`)
    })

    it('throws at definition time when options contains long: \'file\' and input is a schema', () => {
      assert.throws(
        () => defineCommand({
          name: 'query',
          description: 'Run a query',
          input: z.object({ q: z.string() }),
          options: [{ long: 'file', description: 'A conflicting option' }],
          handler: () => ({}),
        }),
        (e: unknown) => { assert.ok(e instanceof Error); return true },
      )
    })

    it('does NOT throw when options contains long: \'file\' but input is omitted', () => {
      assert.doesNotThrow(() => defineCommand({
        name: 'query',
        description: 'Run a query',
        options: [{ long: 'file', description: 'A file option' }],
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

  describe('JSON input via --file', () => {
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

    it('handler receives parsed JSON in parsed.input when --file points to a valid JSON file', async () => {
      const filePath = join(tmpDir, 'valid.json')
      writeFileSync(filePath, JSON.stringify({ cluster: 'test', shards: 5 }))
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ cluster: z.string(), shards: z.number() }),
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await invokeAsync(cmd, ['--file', filePath])
      assert.equal(received.length, 1)
      assert.deepEqual(received[0].input, { cluster: 'test', shards: 5 })
    })

    it('errors with descriptive message when --file points to a nonexistent file', async () => {
      const nonexistent = join(tmpDir, 'does-not-exist.json')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--file', nonexistent])
      assert.match(err, /--file: file not found:/)
    })

    it('errors with descriptive message when --file points to a file with malformed JSON', async () => {
      const filePath = join(tmpDir, 'bad.json')
      writeFileSync(filePath, 'not { valid } json ][')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--file', filePath])
      assert.match(err, /--file: invalid JSON:/)
    })

    it('errors with "empty content" message when --file points to an empty file', async () => {
      const filePath = join(tmpDir, 'empty.json')
      writeFileSync(filePath, '')
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--file', filePath])
      assert.match(err, /--file: invalid JSON: empty content/)
    })

    it('parsed.input is undefined when input is a schema, no --file provided, and stdin is a TTY', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'query',
        description: 'Run a query',
        input: z.object({ q: z.string() }),
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await invokeAsync(cmd, [])
      assert.equal(received.length, 1)
      assert.equal(received[0].input, undefined)
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

    it('errors with "empty content" message when empty data is piped to stdin', async () => {
      const restore = _testSetStdinReader(() => '')
      try {
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
        input: z.object({ q: z.string() }),
          handler: () => ({}),
        })
        const err = await captureErrAsync(cmd, [])
        assert.match(err, /stdin: invalid JSON: empty content/)
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

    it('errors with conflict message when both --file and stdin are provided', async () => {
      const filePath = join(tmpDir, 'input.json')
      writeFileSync(filePath, JSON.stringify({ index: 'my-index' }))
      const restore = _testSetStdinReader(() => JSON.stringify({ index: 'other-index' }))
      try {
        const cmd = defineCommand({
          name: 'search',
          description: 'Run a search',
        input: z.object({ index: z.string() }),
          handler: () => ({}),
        })
        const err = await captureErrAsync(cmd, ['--file', filePath])
        assert.match(err, /cannot read input from both --file and stdin/)
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

    it('handler receives Zod-parsed input when valid JSON is provided via --file', async () => {
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
      await invokeAsync(cmd, ['--file', filePath])
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
      await invokeAsync(cmd, ['--file', filePath])
      assert.deepEqual(received[0], { index: 'logs', size: 10 })
    })

    it('extra properties in JSON are stripped by Zod (strip mode default)', async () => {
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
      await invokeAsync(cmd, ['--file', filePath])
      assert.deepEqual(received[0], { index: 'logs' })
    })

    it('handler receives undefined for input when schema is configured but no input is provided', async () => {
      const schema = z.object({ index: z.string() })
      const received: unknown[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: (parsed) => { received.push(parsed.input); return {} },
      })
      // stdin is TTY (set in beforeEach), no --file flag - no input provided
      await invokeAsync(cmd, [])
      assert.equal(received[0], undefined)
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
      const err = await captureErrAsync(cmd, ['--file', filePath])
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
      const err = await captureErrAsync(cmd, ['--file', filePath])
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
      const err = await captureErrAsync(cmd, ['--file', filePath])
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
      await captureErrAsync(cmd, ['--file', filePath])
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
      const err = await captureErrAsync(cmd, ['--file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /address\.zipCode/)
    })
  })

  describe('commands without input schema', () => {
    it('command with no input does not register --file option', () => {
      const cmd = defineCommand({
        name: 'ping',
        description: 'Ping',
        handler: () => ({}),
      })
      assert.ok(
        !cmd.helpInformation().includes('--file'),
        'expected no --file option when input is omitted',
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


    /** mounts cmd under a root program with --format=json, captures stdout, returns parsed JSON */
    async function invokeWithJsonFormat(cmd: OpaqueCommandHandle, argv: string[]): Promise<{ out: string, parsed: unknown }> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--format <fmt>', 'output format')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      let out = ''
      // intercept process.stdout.write so JSON written directly to stdout is captured
      const origWrite = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: unknown) => { out += String(chunk); return true }
      prog.configureOutput({ writeOut: (s) => { out += s }, writeErr: (s) => { out += s } })
      cmd.configureOutput({ writeOut: (s) => { out += s }, writeErr: (s) => { out += s } })
      try {
        await prog.parseAsync(['--format', 'json', cmd.name(), ...argv], { from: 'user' })
      } catch {
        // exitOverride throws on cmd.error(); that's expected
      } finally {
        process.stdout.write = origWrite
      }
      let parsed: unknown = null
      try { parsed = JSON.parse(out) } catch { /* not JSON - test will fail on assertion */ }
      return { out, parsed }
    }

    it('emits structured JSON error to stdout when --format=json and validation fails', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const { parsed } = await invokeWithJsonFormat(cmd, ['--file', filePath])
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
      const { parsed } = await invokeWithJsonFormat(cmd, ['--file', filePath])
      const issues = ((parsed as Record<string, unknown>)['error'] as Record<string, unknown>)['issues'] as Array<Record<string, unknown>>
      const issue = issues[0]!
      assert.ok(Array.isArray(issue['path']), 'expected path array')
      assert.ok(typeof issue['message'] === 'string')
      assert.deepEqual(issue['path'], ['index'])
    })

    it('handler is NOT invoked when --format=json and validation fails', async () => {
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
      await invokeWithJsonFormat(cmd, ['--file', filePath])
      assert.equal(handlerCalled, false)
    })

    it('text mode (no --format flag) still uses cmd.error() with prettified output', async () => {
      const schema = z.object({ index: z.string() })
      const filePath = join(tmpDir, 'bad4.json')
      writeFileSync(filePath, JSON.stringify({ index: 42 }))
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        input: schema,
        handler: () => ({}),
      })
      const err = await captureErrAsync(cmd, ['--file', filePath])
      assert.match(err, /input validation failed/)
      assert.match(err, /index/)
    })
  })
  describe('global options', () => {
    async function mountUnderRoot(cmd: OpaqueCommandHandle, argv: string[]): Promise<void> {
      const { Command } = await import('commander')
      const prog = new Command('elastic')
      prog.option('--format <fmt>', 'output format')
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
      await mountUnderRoot(cmd, ['--format', 'json', 'health'])
      assert.equal(received.length, 1)
      assert.equal(received[0]!.options['format'], 'json')
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
      assert.equal(received[0]!.options['format'], undefined)
    })

    it('command-level options and global options coexist in parsed.options', async () => {
      const received: ParsedResult[] = []
      const cmd = defineCommand({
        name: 'search',
        description: 'Search',
        options: [{ long: 'index', type: 'string', description: 'Index name' }],
        handler: (parsed) => { received.push(parsed); return {} },
      })
      await mountUnderRoot(cmd, ['--format', 'json', 'search', '--index', 'logs'])
      assert.equal(received.length, 1)
      assert.equal(received[0]!.options['format'], 'json')
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
      prog.option('--format <fmt>', 'output format')
      prog.addCommand(cmd)
      prog.exitOverride()
      cmd.exitOverride()
      return captureOutput(() => prog.parseAsync([...rootArgv, cmd.name(), ...cmdArgv], { from: 'user' }))
    }

    it('factory writes handler return value as compact JSON when --format=json', async () => {
      const cmd = defineCommand({
        name: 'status',
        description: 'Get status',
        handler: () => ({ ok: true, count: 3 }),
      })
      const out = await invokeUnderRoot(cmd, ['--format', 'json'], [])
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
      const out = await invokeUnderRoot(cmd, ['--format', 'json'], [])
      assert.deepEqual(JSON.parse(out), { async: true })
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

describe('no Commander API leaks', () => {
  it('factory module exports only public API and test seam at runtime', async () => {
    const factory = await import('../src/factory.ts')
    const exported = Object.keys(factory)
    assert.deepEqual(exported.sort(), ['_testSetStdinReader', 'defineCommand', 'defineGroup'])
  })

  it('defineCommand return value requires no Commander import to use', () => {
    // a command author only needs factory imports — they never call new Command() themselves
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
    // `import type { Command } from 'commander'` — OpaqueCommandHandle covers it
    function register(handle: OpaqueCommandHandle): string {
      return handle.name()
    }
    const handle = defineCommand({ name: 'deploy', description: 'Deploy', handler: () => ({}) })
    assert.equal(register(handle), 'deploy')
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
