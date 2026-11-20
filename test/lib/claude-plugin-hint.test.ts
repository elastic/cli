/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLAUDE_PLUGIN_HINT, emitClaudePluginHint } from '../../src/lib/claude-plugin-hint.ts'

const CLI_ENTRY = join(process.cwd(), 'src', 'cli.ts')
const IS_BUN = 'bun' in process.versions

function runCli (
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, NODE_V8_COVERAGE: '', ...env }
    const runtimeArgs = IS_BUN
      ? [CLI_ENTRY, ...args]
      : ['--import', 'tsx/esm', CLI_ENTRY, ...args]
    const child = spawn(process.execPath, runtimeArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    })
    child.stdin.end('')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d })
    child.stderr.on('data', (d: Buffer) => { stderr += d })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('emitClaudePluginHint', () => {
  it('writes the plugin hint when CLAUDECODE is set', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDECODE: '1' }, (s) => { lines.push(s) }, ['node', 'elastic'])
    assert.deepEqual(lines, [CLAUDE_PLUGIN_HINT])
    assert.match(CLAUDE_PLUGIN_HINT, /^<claude-code-hint v="1" type="plugin" value="elastic@anthropic-plugin-directory" \/>\n$/)
  })

  it('writes the plugin hint when CLAUDE_CODE_CHILD_SESSION is set', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDE_CODE_CHILD_SESSION: '1' }, (s) => { lines.push(s) }, ['node', 'elastic'])
    assert.deepEqual(lines, [CLAUDE_PLUGIN_HINT])
  })

  it('writes nothing when Claude env vars are absent', () => {
    const lines: string[] = []
    emitClaudePluginHint({}, (s) => { lines.push(s) }, ['node', 'elastic'])
    assert.deepEqual(lines, [])
  })

  it('writes nothing when Claude env vars are empty', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDECODE: '', CLAUDE_CODE_CHILD_SESSION: '' }, (s) => { lines.push(s) }, ['node', 'elastic'])
    assert.deepEqual(lines, [])
  })

  it('writes nothing when --json is on argv', () => {
    const lines: string[] = []
    emitClaudePluginHint({ CLAUDECODE: '1' }, (s) => { lines.push(s) }, ['node', 'elastic', '--json', 'version'])
    assert.deepEqual(lines, [])
  })
})

describe('claude plugin hint (cli)', () => {
  it('keeps JSON stderr parseable when CLAUDECODE is set with --json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-claude-hint-'))
    try {
      const { code, stderr } = await runCli(
        ['--json', 'stack', 'es', 'ping'],
        {
          HOME: dir,
          USERPROFILE: dir,
          CLAUDECODE: '1',
          ELASTIC_CLI_CONFIG_FILE: join(dir, 'missing.yml'),
        },
      )
      assert.notEqual(code, 0)
      assert.doesNotMatch(stderr, /claude-code-hint/)
      const payload = JSON.parse(stderr.trim().split('\n').at(-1)!)
      assert.equal(typeof payload.error?.message, 'string')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
