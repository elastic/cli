/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { loadAllEsApis } from '../../src/es/apis.ts'
import { parseTestFile, isServerless } from './parser.ts'
import { generateScript, generateRunner, UnmappedBodyKeyError } from './generator.ts'

const { values } = parseArgs({
  options: {
    'tests-dir': { type: 'string' },
    output: { type: 'string', default: 'test/functional/es' }
  },
  strict: true
})

const testsDir = values['tests-dir']
const outputDir = values.output ?? 'test/functional/es'

if (testsDir == null) {
  console.error('Usage: npx tsx codegen/functional/index.ts --tests-dir <path-to-elasticsearch-clients-tests/tests>')
  process.exit(1)
}

function walkYamlFiles (dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walkYamlFiles(full))
    } else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
      files.push(full)
    }
  }
  return files
}

// Tests skipped due to infra requirements or known codegen gaps.
// CI uses trial license, so most enterprise features are available.
const SKIP_ENTERPRISE: Set<string> = new Set([
  // Security — requires xpack.security.enabled=true (CI runs with it disabled)
  'security/10_api_key_basic.yml',
  'security/20_authenticate.yml',
  // Search applications — body field wrapping issue (codegen gap)
  'search_application/10_basic.yml',
  'search_application/20_behavioral_analytics.yml',
  // ML preview_datafeed — assertion mismatch (codegen gap)
  'machine_learning/preview_datafeed.yml',
  // ML datafeed tests use the deprecated `indexes` body-field alias for
  // ml.put_datafeed; the current schema only declares `indices` (codegen gap)
  'machine_learning/datafeed_crud.yml',
  'machine_learning/start_stop_datafeed.yml',
  // ESQL view — /_query/view API does not exist in ES 9.3.0
  'esql/40_view.yml',
  // Enterprise Search connectors — system index write block even with trial license
  'entsearch/20_connector.yml',
  'entsearch/50_connector_updates.yml',
])

const yamlFiles = walkYamlFiles(testsDir)
console.log(`Found ${yamlFiles.length} YAML test files in ${testsDir}`)

mkdirSync(outputDir, { recursive: true })

let generated = 0
let skippedNotServerless = 0
let skippedNoActions = 0
let skippedEnterprise = 0
const scriptPaths: string[] = []
const allSkippedActions = new Set<string>()
const bodyKeyErrors: string[] = []

const allApis = await loadAllEsApis()

for (const yamlFile of yamlFiles) {
  const relPath = relative(testsDir, yamlFile)
  const content = readFileSync(yamlFile, 'utf-8')
  const testFile = parseTestFile(content, relPath)

  if (!isServerless(testFile)) {
    skippedNotServerless++
    continue
  }

  // Skip tests that are explicitly excluded from stack (stack: false in YAML).
  // These are serverless-only tests that cannot pass against a standard ES.
  if (testFile.requires.stack === false) {
    skippedNotServerless++
    continue
  }

  if (SKIP_ENTERPRISE.has(relPath)) {
    skippedEnterprise++
    continue
  }

  let result
  try {
    result = generateScript(testFile, allApis)
  } catch (err) {
    if (err instanceof UnmappedBodyKeyError) {
      bodyKeyErrors.push(`${relPath}: ${err.message}`)
      continue
    }
    throw err
  }

  for (const action of result.skippedActions) {
    allSkippedActions.add(action)
  }

  if (result.skipped) {
    skippedNoActions++
    continue
  }

  const scriptName = relPath.replace(/\.ya?ml$/, '.sh')
  const scriptPath = join(outputDir, scriptName)
  mkdirSync(dirname(scriptPath), { recursive: true })
  writeFileSync(scriptPath, result.script, { mode: 0o755 })

  scriptPaths.push(scriptName)
  generated++
}

// Write the runner script
const runner = generateRunner(scriptPaths)
writeFileSync(join(outputDir, 'run.sh'), runner, { mode: 0o755 })

console.log('')
console.log('=== Summary ===')
console.log(`  Generated:              ${generated} scripts`)
console.log(`  Skipped (not serverless): ${skippedNotServerless}`)
console.log(`  Skipped (enterprise):     ${skippedEnterprise}`)
console.log(`  Skipped (no CLI actions): ${skippedNoActions}`)

if (allSkippedActions.size > 0) {
  console.log(`  Unmapped actions:       ${[...allSkippedActions].sort().join(', ')}`)
}

console.log(`  Output:                 ${outputDir}/`)
console.log(`  Runner:                 ${outputDir}/run.sh`)

if (bodyKeyErrors.length > 0) {
  console.error('')
  console.error(`=== Unmapped body keys (${bodyKeyErrors.length}) ===`)
  for (const msg of bodyKeyErrors) {
    console.error(`  ${msg}`)
  }
  console.error('')
  console.error('These are schema/mapper gaps: a request body key has no corresponding CLI flag.')
  console.error('Add a mapping in codegen/functional/mapper.ts, fix the upstream schema, or add')
  console.error('an entry to SKIP_ENTERPRISE with a comment explaining the known gap.')
  process.exit(1)
}
