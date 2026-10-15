#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs the unit test suite with coverage enforcement. Lives here instead of a
// package.json one-liner so each flag can carry its rationale, and so globs
// reach node unquoted on every platform's npm shell.
//
// Extra args are appended, so `npm run test:unit -- test/foo.test.ts` runs a
// subset. With no file args, `node --test` falls back to its default glob.
//
// That glob includes `**/test-*.{js,mjs,cjs}`, so this file must never be named
// `test-*`: the child runner would discover it, run it, and spawn another runner
// without bound (a fork bomb). The env guard below makes that failure loud.
import { spawnSync } from 'node:child_process'

const GUARD = 'ELASTIC_CLI_UNIT_RUNNER'
if (process.env[GUARD] != null) {
  console.error(`${GUARD} is set: refusing to start a nested test runner (recursive spawn)`)
  process.exit(1)
}

const args = [
  '--max-old-space-size=8192',
  '--import', 'tsx/esm',
  '--import', './test/setup-non-interactive.ts',
  '--test',
  '--test-timeout=60000',
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-branches=90',
  '--test-coverage-functions=90',
  '--test-coverage-include=src/**/*.ts',
  '--test-coverage-include=packages/*/src/**/*.ts',
  // Excludes date from when coverage was first enforced (#197): API
  // definition modules and barrel re-exports of @elastic/schemas, which carry
  // no logic of their own worth gating on.
  '--test-coverage-exclude=src/es/api-manifest.ts',
  '--test-coverage-exclude=src/cloud/serverless-apis.ts',
  '--test-coverage-exclude=node_modules/**',
  ...process.argv.slice(2)
]

const { status } = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, [GUARD]: '1' } })
process.exit(status ?? 1)
