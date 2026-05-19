/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI_ENTRY = join(process.cwd(), 'src', 'cli.ts')
const IS_BUN = 'bun' in process.versions

/**
 * Spawns the CLI directly from source so the tests do not depend on a fresh
 * `dist/` build. Uses `process.execPath` to invoke the same runtime as the
 * parent (matches the cross-runtime pattern in test/es/register.test.ts):
 *   - Node: requires the `tsx/esm` loader to evaluate `.ts` entry points.
 *   - Bun:  understands TypeScript natively; spawning `node_modules/.bin/tsx`
 *           through Bun's child-process env corrupts dynamic `import()` for
 *           heavier subtrees (e.g. `es/register.ts`), so we sidestep it.
 *
 * Slower per-spawn than `node dist/cli.js`, but exercises the source path
 * and the same end-to-end completion protocol.
 */
function runCli (
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Override NODE_V8_COVERAGE with the empty string. When the parent test
    // runner uses --experimental-test-coverage, Node propagates this env var
    // to children even if we `delete` it from the spread object (special-
    // cased on Linux). Setting it to "" disables child-process coverage
    // collection, preventing transitive imports from cli.ts (loaded fully by
    // the child) from leaking partial-function coverage into the parent's
    // report and dragging the project's averages below the 90% threshold.
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

function parseProtocol (stdout: string): { candidates: string[]; directive: number } {
  const lines = stdout.split('\n').filter((l) => l.length > 0)
  const last = lines[lines.length - 1] ?? ''
  if (!last.startsWith(':')) return { candidates: lines, directive: 0 }
  return { candidates: lines.slice(0, -1), directive: Number(last.slice(1)) }
}

describe('elastic CLI -- shell completion end-to-end', () => {
  it('`__complete -- ""` lists every visible top-level group', async () => {
    const { code, stdout } = await runCli(['__complete', '--', ''])
    assert.equal(code, 0, `expected exit 0, got ${code}`)
    const out = parseProtocol(stdout)
    for (const expected of ['version', 'stack', 'cloud', 'docs', 'config', 'sanitize', 'es', 'kb', 'completion']) {
      assert.ok(out.candidates.includes(expected), `missing top-level "${expected}" in ${out.candidates.join(',')}`)
    }
    assert.equal(out.directive & 2, 2, 'expected NO_FILE_COMP bit (2) in directive')
  })

  it('`__complete -- es ""` walks into the stack/es subtree after alias rewrite', async () => {
    const { code, stdout } = await runCli(['__complete', '--', 'es', ''])
    assert.equal(code, 0)
    const out = parseProtocol(stdout)
    assert.ok(out.candidates.includes('indices'), `expected es indices in ${out.candidates.length} candidates`)
    assert.ok(out.candidates.includes('cluster'))
    assert.ok(out.candidates.includes('search'))
  })

  it('`__complete -- --use-context ""` lists context names from a temp config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-complete-'))
    try {
      const cfg = join(dir, 'config.yml')
      await writeFile(cfg, [
        'current_context: dev',
        'contexts:',
        '  dev:',
        '    elasticsearch:',
        '      url: http://localhost:9200',
        '  prod:',
        '    elasticsearch:',
        '      url: http://localhost:9200',
        '',
      ].join('\n'))
      const { code, stdout } = await runCli(
        ['__complete', '--', '--use-context', ''],
        { ELASTIC_CLI_CONFIG_FILE: cfg },
      )
      assert.equal(code, 0)
      const out = parseProtocol(stdout)
      assert.deepEqual(out.candidates.sort(), ['dev', 'prod'])
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`__complete` exits 0 with empty candidates when no config exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-complete-nocfg-'))
    try {
      const { code, stdout } = await runCli(
        ['__complete', '--', '--use-context', ''],
        { HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir },
      )
      assert.equal(code, 0, 'completion must never fail even without a config')
      const out = parseProtocol(stdout)
      assert.deepEqual(out.candidates, [])
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`completion bash` prints a wrapper script containing complete -F', async () => {
    const { code, stdout } = await runCli(['completion', 'bash'])
    assert.equal(code, 0)
    assert.ok(stdout.length > 100, 'expected a non-trivial wrapper script')
    assert.match(stdout, /complete -F .* elastic/)
    assert.match(stdout, /__complete/)
  })

  it('`completion zsh` prints a #compdef wrapper', async () => {
    const { code, stdout } = await runCli(['completion', 'zsh'])
    assert.equal(code, 0)
    assert.match(stdout, /^#compdef elastic/)
  })

  it('`completion fish` prints a fish wrapper', async () => {
    const { code, stdout } = await runCli(['completion', 'fish'])
    assert.equal(code, 0)
    assert.match(stdout, /complete -c elastic/)
  })

  it('`completion <unknown>` exits 1 with a structured error', async () => {
    const { code, stderr } = await runCli(['completion', 'tcsh'])
    assert.equal(code, 1)
    assert.match(stderr, /unknown shell/i)
  })

  it('`__complete` does not require a working config (no "no config" error)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-cli-complete-isolated-'))
    try {
      const { code, stderr } = await runCli(
        ['__complete', '--', ''],
        { HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir },
      )
      assert.equal(code, 0)
      assert.equal(stderr, '', `unexpected stderr: ${stderr}`)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('`__complete -- ""` does not include the hidden __complete command itself', async () => {
    const { stdout } = await runCli(['__complete', '--', ''])
    const out = parseProtocol(stdout)
    assert.ok(!out.candidates.includes('__complete'),
      'the internal __complete command must not appear as a completion candidate')
  })
})
