/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, usage } from '../src/argv.ts'
import { QuickstartError } from '../src/errors.ts'

test('defaults to interactive prod with color', () => {
  const args = parseArgs([])
  assert.deepEqual(args, { json: false, help: false, dryRun: false, color: true, env: 'prod' })
})

test('parses every supported flag', () => {
  const args = parseArgs(['--json', '--dry-run', '--no-color', '--env', 'qa', '--cli-bin', '/opt/elastic'])
  assert.equal(args.json, true)
  assert.equal(args.dryRun, true)
  assert.equal(args.color, false)
  assert.equal(args.env, 'qa')
  assert.equal(args.cliBin, '/opt/elastic')
})

test('treats `help` positional and --help alike', () => {
  assert.equal(parseArgs(['help']).help, true)
  assert.equal(parseArgs(['--help']).help, true)
  assert.equal(parseArgs(['-h']).help, true)
})

test('--env is case-insensitive and trims', () => {
  assert.equal(parseArgs(['--env', '  QA ']).env, 'qa')
})

test('unknown --env is a hard error, never a silent prod fallback', () => {
  assert.throws(
    () => parseArgs(['--env', 'staging']),
    (err: unknown) => err instanceof QuickstartError && err.code === 'bad_env',
  )
})

test('unknown arguments are rejected rather than ignored', () => {
  assert.throws(
    () => parseArgs(['--regoin', 'aws-us-east-1']),
    (err: unknown) => err instanceof QuickstartError && err.code === 'unknown_argument',
  )
})

test('a flag consuming the next flag as its value is an error', () => {
  assert.throws(
    () => parseArgs(['--env', '--json']),
    (err: unknown) => err instanceof QuickstartError && err.code === 'missing_flag_value',
  )
  assert.throws(
    () => parseArgs(['--cli-bin']),
    (err: unknown) => err instanceof QuickstartError && err.code === 'missing_flag_value',
  )
})

test('usage documents the --help caveat', () => {
  assert.match(usage(), /prints the root CLI help/)
})
