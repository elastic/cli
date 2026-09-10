/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import { defineCommand, defineGroup } from '../../src/factory.ts'
import {
  enumerate,
  DIRECTIVE_NO_FILE_COMP,
  DIRECTIVE_NO_SPACE,
  type DynamicCompleterRegistry,
} from '../../src/completion/enumerate.ts'

function buildSampleProgram (): Command {
  const program = new Command('elastic')
  program.option('--config-file <path>', 'config file')
  program.option('--use-context <name>', 'override active context')
  program.option('--json', 'output as JSON')

  const versionCmd = defineCommand({
    name: 'version',
    description: 'Print the elastic CLI version',
    handler: () => ({ version: '0.0.0' }),
  })
  program.addCommand(versionCmd)

  const esInfo = defineCommand({
    name: 'info',
    description: 'Cluster info',
    handler: () => ({}),
  })
  const esSearch = defineCommand({
    name: 'search',
    description: 'Search',
    options: [
      { long: 'index', short: 'i', description: 'Index name', type: 'string' },
      { long: 'size', description: 'Number of hits', type: 'number' },
    ],
    handler: () => ({}),
  })
  const esGroup = defineGroup(
    { name: 'es', description: 'Elasticsearch API' },
    esInfo,
    esSearch,
  )
  esGroup.alias('elasticsearch')

  const stack = defineGroup(
    { name: 'stack', description: 'Stack components' },
    esGroup,
  )
  program.addCommand(stack)

  const cloud = defineGroup(
    { name: 'cloud', description: 'Cloud' },
    defineCommand({ name: 'trust', description: 'Trust', handler: () => ({}) }),
  )
  program.addCommand(cloud)

  return program
}

describe('enumerate -- top-level candidates', () => {
  it('returns all top-level commands when words is empty', async () => {
    const result = await enumerate(buildSampleProgram(), [])
    assert.ok(result.candidates.includes('version'))
    assert.ok(result.candidates.includes('stack'))
    assert.ok(result.candidates.includes('cloud'))
  })

  it('returns all top-level commands when only an empty incomplete word is present', async () => {
    const result = await enumerate(buildSampleProgram(), [''])
    assert.ok(result.candidates.includes('version'))
    assert.ok(result.candidates.includes('stack'))
  })

  it('prefix-filters top-level candidates against a partial word', async () => {
    const result = await enumerate(buildSampleProgram(), ['ve'])
    assert.deepEqual(result.candidates, ['version'])
  })

  it('default directive is no-file-comp', async () => {
    const result = await enumerate(buildSampleProgram(), [])
    assert.equal(result.directive & DIRECTIVE_NO_FILE_COMP, DIRECTIVE_NO_FILE_COMP)
  })
})

describe('enumerate -- nested groups', () => {
  it('walks into a group and lists its children for an empty incomplete word', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', ''])
    assert.ok(result.candidates.includes('info'))
    assert.ok(result.candidates.includes('search'))
  })

  it('walks via the alias and yields identical children', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'elasticsearch', ''])
    assert.ok(result.candidates.includes('info'))
    assert.ok(result.candidates.includes('search'))
  })

  it('prefix-filters nested candidates', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'sea'])
    assert.deepEqual(result.candidates, ['search'])
  })

  it('exposes group aliases as candidates of the parent', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', ''])
    assert.ok(result.candidates.includes('es'))
    assert.ok(result.candidates.includes('elasticsearch'))
  })
})

describe('enumerate -- flag completion', () => {
  it('lists matching long flags on a leaf command', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'search', '--in'])
    assert.ok(result.candidates.includes('--index'))
  })

  it('lists all flags of the leaf command for "--"', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'search', '--'])
    assert.ok(result.candidates.includes('--index'))
    assert.ok(result.candidates.includes('--size'))
  })

  it('includes global flags from the root program at every level', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'search', '--js'])
    assert.ok(result.candidates.includes('--json'))
  })

  it('includes --help at every level', async () => {
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'search', '--h'])
    assert.ok(result.candidates.includes('--help'))
  })
})

describe('enumerate -- hidden commands', () => {
  it('skips commands flagged hidden', async () => {
    const program = buildSampleProgram()
    const stack = program.commands.find((c) => c.name() === 'stack')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(stack as any)._hidden = true
    const result = await enumerate(program, [''])
    assert.ok(!result.candidates.includes('stack'))
    assert.ok(result.candidates.includes('cloud'))
  })
})

describe('enumerate -- dynamic completer registry', () => {
  it('invokes the registered completer when the previous word is its flag', async () => {
    const calls: string[] = []
    const registry: DynamicCompleterRegistry = {
      get (flag) {
        if (flag === '--use-context') {
          return () => {
            calls.push(flag)
            return ['local', 'staging', 'prod']
          }
        }
        return undefined
      },
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context', ''], registry)
    assert.deepEqual(result.candidates, ['local', 'staging', 'prod'])
    assert.deepEqual(calls, ['--use-context'])
  })

  it('prefix-filters dynamic candidates against the incomplete word', async () => {
    const registry: DynamicCompleterRegistry = {
      get: (flag) => flag === '--use-context' ? () => ['local', 'staging', 'prod'] : undefined,
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context', 'st'], registry)
    assert.deepEqual(result.candidates, ['staging'])
  })

  it('returns empty when previous word is an unknown dynamic flag', async () => {
    const registry: DynamicCompleterRegistry = {
      get: () => undefined,
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context', ''], registry)
    assert.deepEqual(result.candidates, [])
  })

  it('supports the --flag=value form via DIRECTIVE_NO_SPACE', async () => {
    const registry: DynamicCompleterRegistry = {
      get: (flag) => flag === '--use-context' ? () => ['local', 'staging'] : undefined,
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context=st'], registry)
    assert.deepEqual(result.candidates, ['staging'])
    assert.equal(result.directive & DIRECTIVE_NO_SPACE, DIRECTIVE_NO_SPACE)
  })

  it('returns empty (not throw) when completer rejects', async () => {
    const registry: DynamicCompleterRegistry = {
      get: () => () => { throw new Error('boom') },
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context', ''], registry)
    assert.deepEqual(result.candidates, [])
  })

  it('returns empty when completer returns a non-array (defensive)', async () => {
    const registry: DynamicCompleterRegistry = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: () => (() => null) as any,
    }
    const result = await enumerate(buildSampleProgram(), ['--use-context', ''], registry)
    assert.deepEqual(result.candidates, [])
  })

  it('returns empty when previous word is an unregistered long flag', async () => {
    const registry: DynamicCompleterRegistry = { get: () => undefined }
    const result = await enumerate(buildSampleProgram(), ['--unknown-flag', ''], registry)
    assert.deepEqual(result.candidates, [])
  })
})

describe('enumerate -- value-taking flag walk', () => {
  it('skips the value of a value-taking flag and still descends into es', async () => {
    // `--use-context staging` should not interfere with walking into es.
    const result = await enumerate(buildSampleProgram(), ['--use-context', 'staging', 'stack', 'es', ''])
    assert.ok(result.candidates.includes('info'))
    assert.ok(result.candidates.includes('search'))
  })

  it('does not skip the next word after a boolean flag', async () => {
    // `--json` does not take a value; the next word IS the first positional.
    const result = await enumerate(buildSampleProgram(), ['--json', 'stack', 'es', ''])
    assert.ok(result.candidates.includes('info'))
  })

  it('does not double-skip when flag is given in --flag=value form', async () => {
    const result = await enumerate(buildSampleProgram(), ['--use-context=staging', 'stack', 'es', ''])
    assert.ok(result.candidates.includes('info'))
  })

  it('recognises a short flag as value-taking', async () => {
    // `-i my-index` (short of --index, registered on es search) takes a value.
    const result = await enumerate(buildSampleProgram(), ['stack', 'es', 'search', '-i', 'idx', '--'])
    // After consuming -i and its value, we're at "search" with incomplete "--",
    // so we should see flag candidates for the search command.
    assert.ok(result.candidates.includes('--size'),
      `expected --size in candidates, got ${result.candidates.join(',')}`)
  })
})

describe('enumerate -- positional completer registry', () => {
  function buildProgramWithLeaf (): Command {
    const program = buildSampleProgram()
    const setCmd = defineCommand({
      name: 'set',
      description: 'Set current context',
      positionalArg: { name: 'name', description: 'context name', required: true },
      handler: () => ({}),
    })
    const currentCtx = defineGroup({ name: 'current-context', description: 'View or change current context' }, setCmd)
    const config = defineGroup({ name: 'config', description: 'Config' }, currentCtx)
    program.addCommand(config)
    return program
  }

  it('invokes a positional completer for a leaf command', async () => {
    const registry: DynamicCompleterRegistry = {
      get: () => undefined,
      getPositional: (path) => path === 'config current-context set' ? () => ['local', 'staging', 'prod'] : undefined,
    }
    const result = await enumerate(buildProgramWithLeaf(), ['config', 'current-context', 'set', ''], registry)
    assert.deepEqual(result.candidates, ['local', 'staging', 'prod'])
  })

  it('prefix-filters positional candidates against the incomplete word', async () => {
    const registry: DynamicCompleterRegistry = {
      get: () => undefined,
      getPositional: () => () => ['local', 'staging', 'prod'],
    }
    const result = await enumerate(buildProgramWithLeaf(), ['config', 'current-context', 'set', 'st'], registry)
    assert.deepEqual(result.candidates, ['staging'])
  })

  it('returns empty (not throw) when positional completer rejects', async () => {
    const registry: DynamicCompleterRegistry = {
      get: () => undefined,
      getPositional: () => () => { throw new Error('boom') },
    }
    const result = await enumerate(buildProgramWithLeaf(), ['config', 'current-context', 'set', ''], registry)
    assert.deepEqual(result.candidates, [])
  })

  it('does not call getPositional when the command has children', async () => {
    const calls: string[] = []
    const registry: DynamicCompleterRegistry = {
      get: () => undefined,
      getPositional: (path) => { calls.push(path); return undefined },
    }
    // 'config' has children — should return children, not invoke positional
    const result = await enumerate(buildProgramWithLeaf(), ['config', ''], registry)
    assert.ok(result.candidates.includes('current-context'))
    assert.deepEqual(calls, [])
  })
})

describe('enumerate -- edge cases', () => {
  it('treats an unmatched prefix word as the current incomplete word', async () => {
    const result = await enumerate(buildSampleProgram(), ['zzz'])
    assert.deepEqual(result.candidates, [])
  })

  it('handles single dash gracefully (no candidates)', async () => {
    const result = await enumerate(buildSampleProgram(), ['-'])
    assert.deepEqual(result.candidates, [])
  })

  it('returns subcommands again after a successful partial group match (no descent)', async () => {
    const result = await enumerate(buildSampleProgram(), ['sta'])
    assert.deepEqual(result.candidates, ['stack'])
  })
})
