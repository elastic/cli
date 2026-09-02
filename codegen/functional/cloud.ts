/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codegen for Cloud control plane functional tests.
 *
 * Reads client-agnostic YAML test definitions from
 * `test/functional/cloud/definitions/` (authored in the elasticsearch-clients-tests
 * format, same as the Kibana definitions) and emits bash scripts that exercise
 * the Cloud APIs through the CLI.
 *
 * The definitions reference raw `namespace.action` operations from
 * `@elastic/schemas`; they never mention the CLI. This generator is the only
 * place that maps each operation onto the restructured `cloud …` command tree,
 * via `cloudCliPath` (which mirrors `src/cloud/register.ts`). Definitions are
 * loaded with a precomputed `cliPath` so the shared mapper/generator emit the
 * correct nested command path instead of a flat `namespace name`.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { loadCloudApis } from '../../src/cloud/apis.ts'
import { loadServerlessApis } from '../../src/cloud/serverless-apis.ts'
import { cloudCliPath } from './cloud-path.ts'
import { parseTestFile } from './parser.ts'
import { generateScript, generateRunner, type RunnerScript } from './generator.ts'
import type { ApiActionDef } from './types.ts'

const DEFS_DIR = 'test/functional/cloud/definitions'
const OUT_DIR = 'test/functional/cloud/generated'

// The CLI is built but not installed on PATH in CI, so scripts invoke the
// built entry point directly (same approach as the Kibana tests).
const CLOUD_PREAMBLE = [
  'exec < /dev/null',
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"',
  'ELASTIC="node $REPO_ROOT/dist/cli.js --json"',
  'RESPONSE=""'
]

const cloudDefs = [...(await loadCloudApis()), ...(await loadServerlessApis())]
const apis: ApiActionDef[] = cloudDefs.map((def) => ({
  name: def.name,
  namespace: def.namespace,
  method: def.method,
  input: def.input,
  intent: { destructive: def.destructive },
  cliPath: cloudCliPath(def),
}))

mkdirSync(OUT_DIR, { recursive: true })

const yamlFiles = readdirSync(DEFS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

const scripts: RunnerScript[] = []
const allSkippedActions = new Set<string>()

for (const file of yamlFiles) {
  const name = basename(file).replace(/\.ya?ml$/, '')
  const content = readFileSync(join(DEFS_DIR, file), 'utf-8')
  const testFile = parseTestFile(content, file)

  const result = generateScript(testFile, apis, {
    clientArgs: ['cloud'],
    preamble: CLOUD_PREAMBLE,
    skipEmptySet: true,
    skipNotFound: true
  })

  for (const action of result.skippedActions) allSkippedActions.add(action)

  const outPath = join(OUT_DIR, `${name}.sh`)
  writeFileSync(outPath, result.script, { mode: 0o755 })
  scripts.push({ path: `${name}.sh` })
  console.log(`  generated: ${outPath}`)
}

const runner = generateRunner(scripts)
writeFileSync(join(OUT_DIR, 'run.sh'), runner, { mode: 0o755 })

console.log(`\nGenerated ${scripts.length} scripts + run.sh → ${OUT_DIR}/`)
if (allSkippedActions.size > 0) {
  console.log(`Skipped unmapped actions: ${[...allSkippedActions].sort().join(', ')}`)
}
