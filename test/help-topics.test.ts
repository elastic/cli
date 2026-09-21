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
import {
  HELP_TOPIC_NAMES,
  HELP_TOPICS,
  LEARN_MORE,
  formatHelpTopicIndex,
  isHelpTopicName,
} from '../src/help-topics.ts'

function runCli (args: string[], env: Record<string, string> = {}): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env }
    delete childEnv.ELASTIC_CLI_CONFIG_FILE
    const child = spawn(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    })
    child.stdin.end('')
    let stdout = '', stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d })
    child.stderr.on('data', (d: Buffer) => { stderr += d })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('help topics', () => {
  it('names the three topics and rejects unknown names', () => {
    assert.deepEqual([...HELP_TOPIC_NAMES], ['formatting', 'environment', 'exit-codes'])
    assert.equal(isHelpTopicName('formatting'), true)
    assert.equal(isHelpTopicName('exit-codes'), true)
    assert.equal(isHelpTopicName(''), false)
    assert.equal(isHelpTopicName('../formatting'), false)
    assert.equal(isHelpTopicName('FORMATING'), false)
    const index = formatHelpTopicIndex()
    assert.match(index, /elastic help <topic>/)
    for (const name of HELP_TOPIC_NAMES) assert.match(index, new RegExp(`\\b${name}\\b`))
    assert.match(LEARN_MORE, /LEARN MORE/)
    assert.match(LEARN_MORE, /elastic help formatting/)
  })

  it('documents the flags, env vars, and exit codes the issue asked for', () => {
    assert.match(HELP_TOPICS.formatting, /--json/)
    assert.match(HELP_TOPICS.formatting, /--output-fields/)
    assert.match(HELP_TOPICS.formatting, /--output-template/)
    assert.match(HELP_TOPICS.formatting, /--help --json/)
    assert.match(HELP_TOPICS.formatting, /table/)
    assert.match(HELP_TOPICS.environment, /ELASTIC_CLI_CONFIG_FILE/)
    assert.match(HELP_TOPICS.environment, /ELASTIC_CLI_TELEMETRY/)
    assert.match(HELP_TOPICS.environment, /ELASTIC_NO_BANNER/)
    assert.match(HELP_TOPICS.environment, /NO_COLOR/)
    assert.match(HELP_TOPICS.environment, /\.elasticrc\.yml/)
    assert.match(HELP_TOPICS.environment, /keychain/)
    assert.match(HELP_TOPICS['exit-codes'], /^0 {2}success/m)
    assert.match(HELP_TOPICS['exit-codes'], /^1 {2}error/m)
    assert.match(HELP_TOPICS['exit-codes'], /reserved/)
  })
})

describe('elastic help (cli)', () => {
  it('prints a topic, lists topics, and rejects unknown names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-help-topic-'))
    try {
      const env = { HOME: dir, USERPROFILE: dir }
      const formatting = await runCli(['help', 'formatting'], env)
      assert.equal(formatting.code, 0, formatting.stderr)
      assert.match(formatting.stdout, /--output-fields/)
      const listed = await runCli(['help'], env)
      assert.equal(listed.code, 0, listed.stderr)
      assert.match(listed.stdout, /formatting/)
      const json = await runCli(['--json', 'help', 'environment'], env)
      assert.equal(json.code, 0, json.stderr)
      const parsed = JSON.parse(json.stdout)
      assert.equal(parsed.topic, 'environment')
      assert.match(parsed.body, /ELASTIC_CLI_CONFIG_FILE/)
      const bad = await runCli(['help', '../x'], env)
      assert.equal(bad.code, 1)
      assert.match(bad.stderr, /unknown help topic/)
      assert.equal(bad.stderr.includes('..'), true)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('lists output flags and LEARN MORE on root --help without those flags on argv', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-root-help-'))
    try {
      const { code, stdout } = await runCli(['--help'], { HOME: dir, USERPROFILE: dir })
      assert.equal(code, 0)
      assert.match(stdout, /--output-fields/)
      assert.match(stdout, /--output-template/)
      assert.match(stdout, /--json/)
      assert.match(stdout, /LEARN MORE/)
      assert.match(stdout, /elastic help formatting/)
      assert.match(stdout, /^\s*help\s/m)
      const jsonHelp = await runCli(['--help', '--json'], { HOME: dir, USERPROFILE: dir })
      assert.equal(jsonHelp.code, 0)
      const parsed = JSON.parse(jsonHelp.stdout) as { options: Array<{ flags: string }>, commands: Array<{ name: string }> }
      assert.ok(parsed.options.some((o) => o.flags.includes('--output-fields')))
      assert.ok(parsed.options.some((o) => o.flags.includes('--output-template')))
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})
