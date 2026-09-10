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

interface CliParameter {
  name: string
  repeatable?: boolean
  separator?: string
}

interface CliCommand {
  name: string
  parameters: CliParameter[]
}

interface CliNamespace {
  segment: string
  commands?: CliCommand[]
  namespaces?: CliNamespace[]
}

function findCommand (namespaces: CliNamespace[], path: string[], name: string): CliCommand | undefined {
  let level = namespaces
  for (const segment of path) {
    const ns = level.find((n) => n.segment === segment)
    if (ns == null) return undefined
    if (segment === path[path.length - 1]) {
      return ns.commands?.find((c) => c.name === name)
    }
    level = ns.namespaces ?? []
  }
  return undefined
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

  it('emits repeatable+separator for a body-routed array-accepting field, and no separator for a query-routed one', async () => {
    const { code, stdout, stderr } = await runCliSchema()
    assert.equal(code, 0, stderr)

    const schema = JSON.parse(stdout) as { namespaces: CliNamespace[] }

    // `mget`'s `ids` is routed to the request body -- ES doesn't split comma-separated
    // values inside JSON bodies, so the emitted parameter must advertise a separator.
    const mget = findCommand(schema.namespaces, ['stack', 'es'], 'mget')
    const ids = mget?.parameters.find((p) => p.name === 'ids')
    assert.equal(ids?.repeatable, true)
    assert.equal(ids?.separator, ',')

    // `bulk`'s `routing` is routed to the querystring -- CSV splitting happens there
    // naturally, so no separator should be emitted even though it's repeatable.
    const bulk = findCommand(schema.namespaces, ['stack', 'es'], 'bulk')
    const routing = bulk?.parameters.find((p) => p.name === 'routing')
    assert.equal(routing?.repeatable, true)
    assert.equal(routing?.separator, undefined)
  })
})
