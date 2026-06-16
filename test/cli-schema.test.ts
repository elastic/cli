/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

function runCliSchema (): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'dist', 'cli.js'), 'cli-schema'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELASTIC_NO_BANNER: '1' },
    })
    child.stdin.end('')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data })
    child.stderr.on('data', (data: Buffer) => { stderr += data })
    child.on('close', (code: number | null) => resolve({ code, stdout, stderr }))
  })
}

describe('cli schema', () => {
  it('does not emit runtime shortcuts into the docs-builder schema', async () => {
    const { code, stdout, stderr } = await runCliSchema()
    assert.equal(code, 0, stderr)

    const schema = JSON.parse(stdout) as Record<string, unknown>
    assert.equal(Object.hasOwn(schema, 'shortcuts'), false)
    assert.ok(Array.isArray(schema['namespaces']))
    assert.ok((schema['namespaces'] as Array<{ segment?: string }>).some(ns => ns.segment === 'stack'))
  })
})
