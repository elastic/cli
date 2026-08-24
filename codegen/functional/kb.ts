/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codegen for Kibana functional tests.
 *
 * Reads client-agnostic YAML test definitions from
 * `test/functional/kb/definitions/` — authored in the same format as
 * elastic/elasticsearch-clients-tests (requires / setup / teardown / named
 * test sections, `do` blocks referencing `namespace.action` operations, and
 * `match` / `set` / `is_true` / `length` / `gt` … assertions) — and emits
 * bash scripts that exercise those Kibana APIs through the CLI.
 *
 * The definitions never mention the CLI: they describe Kibana API operations
 * and expected responses. This generator is the only place that knows the
 * client is the CLI. It maps each `namespace.action` to `stack kb <namespace>
 * <command>` and routes params/body to flags, reusing the shared mapper and
 * generator that also drive the Elasticsearch functional tests.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { loadAllKbApis } from '../../src/kb/apis.ts'
import { parseTestFile } from './parser.ts'
import { generateScript, generateRunner } from './generator.ts'

const DEFS_DIR = 'test/functional/kb/definitions'
const OUT_DIR = 'test/functional/kb/generated'

// The KB test-runner container builds the CLI but does not install it on PATH,
// so scripts invoke the built entry point directly (unlike the ES tests, which
// call the globally-installed `elastic` binary).
const KB_PREAMBLE = [
  'exec < /dev/null',
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"',
  'ELASTIC="node $REPO_ROOT/dist/cli.js --json"',
  'RESPONSE=""'
]

const apis = await loadAllKbApis()

mkdirSync(OUT_DIR, { recursive: true })

const yamlFiles = readdirSync(DEFS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

const scriptNames: string[] = []
const allSkippedActions = new Set<string>()

for (const file of yamlFiles) {
  const name = basename(file).replace(/\.ya?ml$/, '')
  const content = readFileSync(join(DEFS_DIR, file), 'utf-8')
  const testFile = parseTestFile(content, file)

  // Serverless-only tests cannot run against the stack Kibana used in CI.
  if (testFile.requires.stack === false) {
    console.log(`  skipped (stack: false): ${file}`)
    continue
  }

  const result = generateScript(testFile, apis, {
    clientArgs: ['stack', 'kb'],
    preamble: KB_PREAMBLE
  })

  for (const action of result.skippedActions) allSkippedActions.add(action)

  const outPath = join(OUT_DIR, `${name}.sh`)
  writeFileSync(outPath, result.script, { mode: 0o755 })
  scriptNames.push(name)
  console.log(`  generated: ${outPath}`)
}

const runner = generateRunner(scriptNames.map((n) => `${n}.sh`))
writeFileSync(join(OUT_DIR, 'run.sh'), runner, { mode: 0o755 })

console.log(`\nGenerated ${scriptNames.length} scripts + run.sh → ${OUT_DIR}/`)
if (allSkippedActions.size > 0) {
  console.log(`Skipped unmapped actions: ${[...allSkippedActions].sort().join(', ')}`)
}
